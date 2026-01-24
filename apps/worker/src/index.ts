import {
  recordUptimeEvents,
  type UptimeEventRecord,
  type UptimeStatus,
} from "@repo/clickhouse";
import { REGION_ID, WORKER_ID } from "@repo/config";
import {
  xAckBulk,
  xReadGroup,
  xAutoClaimStale,
  xPendingInfo,
} from "@repo/streams";
import { prismaClient } from "@repo/store";
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

  // Start PEL monitoring (every 5 mins)
  setInterval(
    async () => {
      try {
        const pelInfo = await xPendingInfo(REGION_ID);
        if (pelInfo.pending > 0) {
          const oldestIdleSeconds = pelInfo.oldestIdleMs
            ? Math.floor(pelInfo.oldestIdleMs / 1000)
            : 0;
          console.warn(
            `[Worker] PEL Alert: ${pelInfo.pending} pending message(s), oldest idle: ${oldestIdleSeconds}s`,
          );
          if (pelInfo.oldestIdleMs && pelInfo.oldestIdleMs > 180_000) {
            // 3 mins
            console.error(
              `[Worker] PEL CRITICAL: Oldest idle message is ${oldestIdleSeconds}s old (> 3 mins)`,
            );
          }
        }
      } catch (error) {
        console.error("[Worker] Failed to check PEL status:", error);
      }
    },
    5 * 60 * 1000,
  ); // Every 5 mins

  while (true) {
    // 1. Recover stuck messages (PEL drain) - MUST be done before xReadGroup
    // xReadGroup with ">" will NEVER give PEL messages, so we must drain them first
    const stale = await xAutoClaimStale({
      consumerGroup: REGION_ID,
      workerId: WORKER_ID,
      minIdleMs: 60_000, // 1 min
      count: 10,
    });

    if (stale.length > 0) {
      console.warn(
        `[Worker] Recovered ${stale.length} stale message(s) from PEL`,
      );

      // Validate websites before processing stale messages
      const validStale: typeof stale = [];
      const invalidStaleIds: string[] = [];

      for (const message of stale) {
        const website = await prismaClient.website.findUnique({
          where: { id: message.event.id },
        });

        if (!website || !website.isActive) {
          // ACK deleted/invalid websites immediately to prevent PEL clog
          invalidStaleIds.push(message.id);
          continue;
        }

        validStale.push(message);
      }

      // ACK invalid messages immediately
      if (invalidStaleIds.length > 0) {
        await xAckBulk({
          consumerGroup: REGION_ID,
          eventIds: invalidStaleIds,
        });
        console.log(
          `[Worker] ACKed ${invalidStaleIds.length} invalid/deleted website message(s)`,
        );
      }

      // Process valid stale messages
      if (validStale.length > 0) {
        const staleResults = await Promise.allSettled(
          validStale.map((message) =>
            checkWebsite(message.event.url, message.event.id),
          ),
        );

        const successfulStale: {
          streamId: string;
          event: UptimeEventRecord;
        }[] = [];
        for (let i = 0; i < staleResults.length; i++) {
          const result = staleResults[i];
          const message = validStale[i];
          if (!message) continue;
          if (result?.status === "fulfilled") {
            successfulStale.push({ streamId: message.id, event: result.value });
          } else {
            console.error(
              `[Worker] Failed to check website for stale message ${message.id}`,
              result?.reason,
            );
          }
        }

        try {
          if (successfulStale.length > 0) {
            await recordUptimeEvents(successfulStale.map((s) => s.event));
            console.log(
              `[Worker] Replayed ${successfulStale.length} stale uptime check(s) to ClickHouse`,
            );

            await xAckBulk({
              consumerGroup: REGION_ID,
              eventIds: successfulStale.map((s) => s.streamId),
            });
          }
        } catch (error) {
          console.error("[Worker] Failed to persist stale uptime batch", error);
        }
      }
    }

    // 2. Then read fresh messages
    const fresh = await xReadGroup({
      consumerGroup: REGION_ID,
      workerId: WORKER_ID,
    });

    // Process messages if any were received
    if (fresh.length > 0) {
      // Validate websites before processing fresh messages
      const validFresh: typeof fresh = [];
      const invalidFreshIds: string[] = [];

      for (const message of fresh) {
        const website = await prismaClient.website.findUnique({
          where: { id: message.event.id },
        });

        if (!website || !website.isActive) {
          // ACK deleted/invalid websites immediately to prevent PEL clog
          invalidFreshIds.push(message.id);
          continue;
        }

        validFresh.push(message);
      }

      // ACK invalid messages immediately
      if (invalidFreshIds.length > 0) {
        await xAckBulk({
          consumerGroup: REGION_ID,
          eventIds: invalidFreshIds,
        });
        console.log(
          `[Worker] ACKed ${invalidFreshIds.length} invalid/deleted website message(s)`,
        );
      }

      // Process valid fresh messages
      if (validFresh.length > 0) {
        const results = await Promise.allSettled(
          validFresh.map((message) =>
            checkWebsite(message.event.url, message.event.id),
          ),
        );

        const successful: { streamId: string; event: UptimeEventRecord }[] = [];
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const message = validFresh[i];
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
    }

    // Safety: keep a small delay to avoid tight loop if xReadGroup returns immediately.
    // (We may remove this after verifying blocking behavior via logs.)
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

startWorker().catch((error) => {
  console.error("[Worker] Fatal error:", error);
  process.exit(1);
});
