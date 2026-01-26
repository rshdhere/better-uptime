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

// Validate required environment variables
if (!REGION_ID || !WORKER_ID) {
  console.error(
    "[Worker] Missing required environment variables: REGION_ID and WORKER_ID must be set",
  );
  // Don't exit - log error and let the worker loop handle retries
  // This allows the system to recover if env vars are set later
  console.error(
    "[Worker] Worker will not process messages until REGION_ID and WORKER_ID are set",
  );
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
  // Validate env vars before starting
  if (!REGION_ID || !WORKER_ID) {
    console.error(
      "[Worker] Cannot start: Missing REGION_ID or WORKER_ID. Exiting worker loop.",
    );
    return;
  }

  console.log(
    `[Worker] Starting worker (region=${String(REGION_ID)}, worker=${String(
      WORKER_ID,
    )})`,
  );

  // WORKER SELF-LIVENESS WATCHDOG:
  // Track last successful ClickHouse write to detect worker stalls
  // If no writes occur for >15 minutes, exit with code 1 so PM2 can restart
  let lastSuccessfulWriteAt: number | null = null;

  // PEL monitoring - self-healing, not noisy
  // Only log CRITICAL if pending > 0 for >10 minutes to avoid log spam
  let pelCriticalLoggedAt: number | null = null;
  setInterval(
    async () => {
      try {
        const pelInfo = await xPendingInfo(REGION_ID);
        if (pelInfo.pending > 0) {
          const oldestIdleMs = pelInfo.oldestIdleMs ?? 0;
          const oldestIdleSeconds = Math.floor(oldestIdleMs / 1000);

          // CRITICAL: Only log if pending > 0 for >10 minutes (600s)
          // This prevents log spam while still alerting on persistent issues
          if (oldestIdleMs > 600_000) {
            // 10 minutes
            const now = Date.now();
            // Only log once per 10-minute window to avoid spam
            if (
              pelCriticalLoggedAt === null ||
              now - pelCriticalLoggedAt > 600_000
            ) {
              console.error(
                `[Worker] PEL CRITICAL: ${pelInfo.pending} pending message(s) for >10 minutes, oldest idle: ${oldestIdleSeconds}s. PEL auto-heal should recover these.`,
              );
              pelCriticalLoggedAt = now;
            }
          }
          // System continues running - PEL auto-heal will recover messages
        } else {
          // Reset critical log timestamp when PEL is clear
          pelCriticalLoggedAt = null;
        }
      } catch (error) {
        // Log error but don't crash - monitoring failures shouldn't stop processing
        console.error("[Worker] Failed to check PEL status:", error);
      }
    },
    5 * 60 * 1000,
  ); // Every 5 mins

  // WORKER SELF-LIVENESS WATCHDOG:
  // Monitor last successful ClickHouse write to detect worker stalls
  // If no writes for >15 minutes, exit with code 1 so PM2 can restart
  setInterval(
    () => {
      if (lastSuccessfulWriteAt === null) {
        // No writes yet - this is OK on startup
        return;
      }

      const timeSinceLastWrite = Date.now() - lastSuccessfulWriteAt;
      const timeSinceLastWriteMinutes = Math.floor(timeSinceLastWrite / 60_000);

      // CRITICAL: Exit if no writes for >15 minutes (hard liveness escape hatch)
      if (timeSinceLastWrite > 900_000) {
        // 15 minutes
        console.error(
          `[Worker] LIVENESS CRITICAL: No ClickHouse writes for ${timeSinceLastWriteMinutes} minutes. Worker appears stalled. Exiting to allow PM2 restart.`,
        );
        // eslint-disable-next-line no-undef
        process.exit(1);
      }
    },
    2 * 60 * 1000,
  ); // Check every 2 minutes

  // Helper function to process messages (used for both fresh and reclaimed)
  async function processMessages(
    messages: Awaited<ReturnType<typeof xReadGroup>>,
    isReclaimed: boolean = false,
  ): Promise<void> {
    if (messages.length === 0) {
      return;
    }

    const logPrefix = isReclaimed ? "PEL Reclaim" : "Fresh";
    console.log(
      `[Worker] ${logPrefix}: Processing ${messages.length} message(s)`,
    );

    // Validate websites before processing
    const validMessages: typeof messages = [];
    const invalidMessageIds: string[] = [];

    for (const message of messages) {
      const website = await prismaClient.website.findUnique({
        where: { id: message.event.id },
      });

      if (!website || !website.isActive) {
        invalidMessageIds.push(message.id);
        continue;
      }

      validMessages.push(message);
    }

    // ACK invalid messages immediately
    if (invalidMessageIds.length > 0) {
      await xAckBulk({
        consumerGroup: REGION_ID,
        eventIds: invalidMessageIds,
      });
      console.log(
        `[Worker] ${logPrefix}: ACKed ${invalidMessageIds.length} invalid/deleted website message(s)`,
      );
    }

    // Process valid messages
    if (validMessages.length > 0) {
      const results = await Promise.allSettled(
        validMessages.map((message) =>
          checkWebsite(message.event.url, message.event.id),
        ),
      );

      const successful: { streamId: string; event: UptimeEventRecord }[] = [];
      const failedIds: string[] = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const message = validMessages[i];
        if (!message) continue;

        if (result?.status === "fulfilled") {
          successful.push({ streamId: message.id, event: result.value });
        } else {
          console.error(
            `[Worker] ${logPrefix}: Failed to check website for message ${message.id}`,
            result?.reason,
          );
          failedIds.push(message.id);
        }
      }

      // CRITICAL: ACK ALL messages in finally block, regardless of success/failure
      // This ensures no message is left un-ACKed, preventing PEL growth
      const allMessageIds = [
        ...successful.map((s) => s.streamId),
        ...failedIds,
      ];

      try {
        // Persist immutable uptime events to ClickHouse (single source of truth)
        if (successful.length > 0) {
          await recordUptimeEvents(successful.map((s) => s.event));
          // Update last successful write timestamp for liveness watchdog
          lastSuccessfulWriteAt = Date.now();
          const action = isReclaimed ? "Replayed" : "Recorded";
          console.log(
            `[Worker] ${action} ${successful.length} uptime check(s) to ClickHouse`,
          );
        }
      } catch (error) {
        console.error(
          `[Worker] ${logPrefix}: Failed to persist uptime batch`,
          error,
        );
        // Continue to ACK even if ClickHouse fails - prevents PEL growth
        // Failed checks will be retried on next publisher cycle
      } finally {
        // CRITICAL: ACK ALL messages (successful and failed) in finally block
        // This ensures messages are always ACKed even if:
        // - HTTP check fails
        // - ClickHouse insert fails
        // - Any exception is thrown
        if (allMessageIds.length > 0) {
          try {
            await xAckBulk({
              consumerGroup: REGION_ID,
              eventIds: allMessageIds,
            });
          } catch (ackError) {
            // Log ACK failures but don't throw - message will be reclaimed by PEL reclaim
            // Redis disconnects are handled gracefully - operation will retry
            console.error(
              `[Worker] ${logPrefix}: Failed to ACK messages (will be reclaimed by PEL reclaim):`,
              ackError,
            );
          }
        }
      }
    }
  }

  while (true) {
    try {
      // 1. Read fresh messages first (always prioritize fresh over PEL)
      const fresh = await xReadGroup({
        consumerGroup: REGION_ID,
        workerId: WORKER_ID,
      });

      // Process fresh messages if any were received
      if (fresh.length > 0) {
        await processMessages(fresh, false);
        // Continue loop immediately to check for more fresh messages
        continue;
      }

      // 2. ONLY if no fresh messages: attempt PEL reclaim (repair-only)
      // This ensures fresh messages always have priority and prevents PEL dominance
      const reclaimed = await xAutoClaimStale({
        consumerGroup: REGION_ID,
        workerId: WORKER_ID,
        minIdleMs: 300_000, // 5 minutes - reclaim messages idle > 5 mins
        count: 10, // Process up to 10 reclaimed messages per batch
        maxTotalReclaim: 20, // Max 20 messages per cycle to prevent blocking
      });

      if (reclaimed.length > 0) {
        await processMessages(reclaimed, true);
        // Continue loop to check for fresh messages again
        continue;
      }
    } catch (error) {
      // Log error but don't crash - allow retry on next iteration
      // Connection errors will be handled by Redis reconnect strategy
      console.error("[Worker] Error in main processing loop:", error);
      // No delay on error - retry immediately to recover quickly
    }

    // CRITICAL: No artificial delays - rely only on Redis BLOCK for backpressure
    // XREADGROUP with BLOCK: 1000 will handle server-side blocking
    // This prevents unnecessary CPU usage and allows immediate processing when messages arrive
  }
}

// CRITICAL: Don't exit on errors - allow the worker to retry indefinitely
// Redis connection errors are handled by reconnect strategy
// Other errors are logged and the loop continues
startWorker().catch((error) => {
  console.error("[Worker] Fatal error in startWorker:", error);
  // Don't exit - log error and let the process continue
  // If this is a critical error, it will be logged and can be monitored
  // The worker loop should handle retries automatically
});
