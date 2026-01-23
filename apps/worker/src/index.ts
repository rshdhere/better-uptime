import {
  recordUptimeEvents,
  type UptimeEventRecord,
  type UptimeStatus,
} from "@repo/clickhouse";
import { REGION_ID, WORKER_ID } from "@repo/config";
import {
  xAckBulk,
  xReadGroup,
  xReadGroupPending,
  xAutoClaimStale,
  xPendingDiagnostic,
} from "@repo/streams";
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

  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "run1",
      hypothesisId: "E",
      location: "apps/worker/src/index.ts:startWorker",
      message: "Worker starting",
      data: { regionId: REGION_ID, workerId: WORKER_ID },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // Run diagnostic to check for pending messages
  await xPendingDiagnostic(REGION_ID);
  // #endregion

  // Drain any *stale pending* (already-delivered but unacked) messages first so
  // we don't leave older websites permanently stuck on dead consumers. We use
  // XAUTOCLAIM underneath so we can take over messages from other consumers.
  while (true) {
    const pendingBatch = await xAutoClaimStale({
      consumerGroup: REGION_ID,
      workerId: WORKER_ID,
      minIdleMs: 60_000, // only claim messages idle for at least 60s
      count: 50,
    });

    if (pendingBatch.length === 0) {
      break;
    }

    const pendingResults = await Promise.allSettled(
      pendingBatch.map((message) =>
        checkWebsite(message.event.url, message.event.id),
      ),
    );

    const successfulPending: { streamId: string; event: UptimeEventRecord }[] =
      [];
    for (let i = 0; i < pendingResults.length; i++) {
      const result = pendingResults[i];
      const message = pendingBatch[i];
      if (!message) continue;
      if (result?.status === "fulfilled") {
        successfulPending.push({ streamId: message.id, event: result.value });
      } else {
        console.error(
          `[Worker] Failed to check website for pending message ${message.id}`,
          result?.reason,
        );
      }
    }

    try {
      if (successfulPending.length > 0) {
        await recordUptimeEvents(successfulPending.map((s) => s.event));
        console.log(
          `[Worker] Replayed ${successfulPending.length} pending uptime check(s) to ClickHouse`,
        );

        await xAckBulk({
          consumerGroup: REGION_ID,
          eventIds: successfulPending.map((s) => s.streamId),
        });
      }
    } catch (error) {
      console.error("[Worker] Failed to persist pending uptime batch", error);
      // Intentionally do not break; on the next startup we'll retry draining.
    }
  }

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

    // #region agent log
    // Run diagnostic every 10 loops to track pending message state
    if (loopCount % 10 === 0) {
      await xPendingDiagnostic(REGION_ID);
      fetch(
        "http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "run1",
            hypothesisId: "A",
            location: "apps/worker/src/index.ts:loopCheckpoint",
            message: "Worker loop checkpoint",
            data: { loopCount, regionId: REGION_ID, workerId: WORKER_ID },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
    }
    // #endregion
  }
}

startWorker().catch((error) => {
  console.error("[Worker] Fatal error:", error);
  process.exit(1);
});
