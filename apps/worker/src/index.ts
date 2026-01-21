import {
  recordUptimeEvents,
  type UptimeEventRecord,
  type UptimeStatus,
} from "@repo/clickhouse";
import { REGION_ID, WORKER_ID } from "@repo/config";
import { xAckBulk, xReadGroup } from "@repo/streams";
import axios from "axios";
import process from "node:process";

// Validate required environment variables
if (!REGION_ID || !WORKER_ID) {
  console.error(
    "[Worker] Missing required environment variables: REGION_ID and WORKER_ID must be set",
  );
  process.exit(1);
}

async function checkWebsite(
  url: string,
  websiteId: string,
): Promise<UptimeEventRecord> {
  const startTime = Date.now();
  let status: UptimeStatus = "DOWN";
  let responseTimeMs: number | undefined;
  let httpStatus: number | undefined;
  const checkedAt = new Date();

  try {
    const res = await axios.get(url, {
      timeout: 10_000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        "User-Agent":
          "Uptique/1.0 (Uptime Monitor; https://uptique.raashed.xyz)",
      },
    });

    responseTimeMs = Date.now() - startTime;
    httpStatus = res.status;

    status = typeof httpStatus === "number" && httpStatus < 500 ? "UP" : "DOWN";

    console.log(
      `[Worker] [${websiteId}] ${url} => http=${httpStatus}, ${status}, ${responseTimeMs}ms`,
    );
  } catch (error) {
    responseTimeMs = Date.now() - startTime;

    console.log(
      `[Worker] [${websiteId}] ${url} => FAILED (${responseTimeMs}ms): ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }

  return {
    websiteId,
    regionId: REGION_ID,
    status,
    responseTimeMs,
    httpStatusCode: httpStatus,
    checkedAt,
  };
}

async function startWorker() {
  console.log(
    `[Worker] Starting worker (region=${String(REGION_ID)}, worker=${String(
      WORKER_ID,
    )})`,
  );
  let loopCount = 0;
  while (true) {
    const response = await xReadGroup({
      consumerGroup: REGION_ID,
      workerId: WORKER_ID,
    });

    // Process messages if any were received
    if (response.length > 0) {
      const results = await Promise.allSettled(
        response.map((message) =>
          checkWebsite(message.event.url, message.event.id),
        ),
      );

      const successful: { streamId: string; event: UptimeEventRecord }[] = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const message = response[i];
        if (!message) continue;
        if (result?.status === "fulfilled") {
          successful.push({ streamId: message.id, event: result.value });
        } else {
          console.error(
            `[Worker] Failed to check website for message ${message.id}`,
            result?.reason,
          );
        }
      }

      try {
        // Persist immutable uptime events to ClickHouse (single source of truth)
        await recordUptimeEvents(successful.map((s) => s.event));
        console.log(
          `[Worker] Recorded ${successful.length} uptime check(s) to ClickHouse`,
        );

        // Ack back to the queue only after ClickHouse persistence succeeds
        await xAckBulk({
          consumerGroup: REGION_ID,
          eventIds: successful.map((s) => s.streamId),
        });
      } catch (error) {
        console.error("[Worker] Failed to persist uptime batch", error);
      }
    }

    // Safety: keep a small delay to avoid tight loop if xReadGroup returns immediately.
    // (We may remove this after verifying blocking behavior via logs.)
    await new Promise((resolve) => setTimeout(resolve, 1000));
    loopCount++;
  }
}

startWorker().catch((error) => {
  console.error("[Worker] Fatal error:", error);
  process.exit(1);
});
