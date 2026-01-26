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
  // If no writes occur for >10 minutes, log CRITICAL (but don't crash)
  // PM2 can handle restarts if configured - we just alert
  let lastSuccessfulWriteAt: number | null = null;
  let livenessCriticalLoggedAt: number | null = null;

  // CRITICAL: Periodic PEL auto-heal - reclaims stuck messages every 45 seconds
  // This prevents PEL growth and ensures messages are never permanently stuck
  // Messages idle > 2 minutes (120s) are reclaimed and reprocessed
  // NON-BLOCKING: Max 200 messages per cycle to prevent starving XREADGROUP
  setInterval(async () => {
    try {
      const reclaimed = await xAutoClaimStale({
        consumerGroup: REGION_ID,
        workerId: WORKER_ID,
        minIdleMs: 120_000, // 2 minutes - reclaim messages idle > 2 mins
        count: 50, // Process up to 50 reclaimed messages per batch
        maxTotalReclaim: 200, // Max 200 messages per cycle to prevent blocking
      });

      if (reclaimed.length > 0) {
        console.log(
          `[Worker] PEL Auto-heal: Reclaimed ${reclaimed.length} stale message(s)`,
        );

        // Process reclaimed messages
        const validReclaimed: typeof reclaimed = [];
        const invalidReclaimedIds: string[] = [];

        for (const message of reclaimed) {
          const website = await prismaClient.website.findUnique({
            where: { id: message.event.id },
          });

          if (!website || !website.isActive) {
            invalidReclaimedIds.push(message.id);
            continue;
          }

          validReclaimed.push(message);
        }

        // ACK invalid messages immediately
        if (invalidReclaimedIds.length > 0) {
          await xAckBulk({
            consumerGroup: REGION_ID,
            eventIds: invalidReclaimedIds,
          });
          console.log(
            `[Worker] ACKed ${invalidReclaimedIds.length} invalid/deleted website message(s) from PEL`,
          );
        }

        // Process valid reclaimed messages
        if (validReclaimed.length > 0) {
          const results = await Promise.allSettled(
            validReclaimed.map((message) =>
              checkWebsite(message.event.url, message.event.id),
            ),
          );

          const successfulReclaimed: {
            streamId: string;
            event: UptimeEventRecord;
          }[] = [];
          const failedReclaimedIds: string[] = [];

          for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const message = validReclaimed[i];
            if (!message) continue;

            if (result?.status === "fulfilled") {
              successfulReclaimed.push({
                streamId: message.id,
                event: result.value,
              });
            } else {
              console.error(
                `[Worker] Failed to check website for reclaimed message ${message.id}`,
                result?.reason,
              );
              failedReclaimedIds.push(message.id);
            }
          }

          // RETRY SEMANTICS:
          // - Failed checks are ACKed to prevent PEL growth
          // - Retry happens via publisher re-enqueue (every 3 mins), NOT Redis retry
          // - ClickHouse is the source of truth - failed checks don't block PEL
          // - This ensures PEL never grows unbounded even if checks fail
          try {
            if (successfulReclaimed.length > 0) {
              await recordUptimeEvents(successfulReclaimed.map((s) => s.event));
              // Update last successful write timestamp for liveness watchdog
              lastSuccessfulWriteAt = Date.now();
              livenessCriticalLoggedAt = null; // Reset critical log on successful write
              console.log(
                `[Worker] Replayed ${successfulReclaimed.length} reclaimed uptime check(s) to ClickHouse`,
              );
            }

            // ACK all reclaimed messages regardless of success/failure
            // Failed checks will be retried by publisher on next cycle (3 mins)
            const allReclaimedIds = [
              ...successfulReclaimed.map((s) => s.streamId),
              ...failedReclaimedIds,
            ];
            if (allReclaimedIds.length > 0) {
              await xAckBulk({
                consumerGroup: REGION_ID,
                eventIds: allReclaimedIds,
              });
            }
          } catch (error) {
            console.error(
              "[Worker] Failed to persist/ACK reclaimed uptime batch",
              error,
            );
            // Even if ClickHouse fails, try to ACK to prevent PEL growth
            // Failed checks will be retried by publisher on next cycle
            const allReclaimedIds = [
              ...successfulReclaimed.map((s) => s.streamId),
              ...failedReclaimedIds,
            ];
            if (allReclaimedIds.length > 0) {
              try {
                await xAckBulk({
                  consumerGroup: REGION_ID,
                  eventIds: allReclaimedIds,
                });
              } catch (ackError) {
                console.error(
                  "[Worker] Failed to ACK reclaimed messages after ClickHouse error:",
                  ackError,
                );
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("[Worker] PEL auto-heal failed:", error);
      // Don't throw - allow next cycle to retry
    }
  }, 45 * 1000); // Every 45 seconds

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
  // If no writes for >10 minutes, log CRITICAL (but don't crash)
  // PM2 can handle restarts if configured - we just alert
  setInterval(
    () => {
      if (lastSuccessfulWriteAt === null) {
        // No writes yet - this is OK on startup
        return;
      }

      const timeSinceLastWrite = Date.now() - lastSuccessfulWriteAt;
      const timeSinceLastWriteMinutes = Math.floor(timeSinceLastWrite / 60_000);

      // CRITICAL: Log if no writes for >10 minutes
      if (timeSinceLastWrite > 600_000) {
        // 10 minutes
        const now = Date.now();
        // Only log once per 10-minute window to avoid spam
        if (
          livenessCriticalLoggedAt === null ||
          now - livenessCriticalLoggedAt > 600_000
        ) {
          console.error(
            `[Worker] LIVENESS CRITICAL: No ClickHouse writes for ${timeSinceLastWriteMinutes} minutes. Worker may be stalled. PM2 can restart if configured.`,
          );
          livenessCriticalLoggedAt = now;
        }
      }
      // DO NOT crash - let PM2 handle restarts if configured
      // System continues running to allow recovery
    },
    2 * 60 * 1000,
  ); // Check every 2 minutes

  while (true) {
    try {
      // 2. Read fresh messages (PEL auto-heal is now handled by periodic interval above)
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

          const successful: { streamId: string; event: UptimeEventRecord }[] =
            [];
          const failedIds: string[] = [];

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
            // OBSERVABILITY: Why ClickHouse is the source of truth
            // - Redis Streams are a transient queue, not storage
            // - Streams are trimmed (MAXLEN ~8000) to prevent unbounded growth
            // - Only ClickHouse retains full history for analytics and UI
            // - Failed checks are ACKed from Redis but will be retried via publisher
            //
            // Persist immutable uptime events to ClickHouse (single source of truth)
            if (successful.length > 0) {
              await recordUptimeEvents(successful.map((s) => s.event));
              // Update last successful write timestamp for liveness watchdog
              lastSuccessfulWriteAt = Date.now();
              livenessCriticalLoggedAt = null; // Reset critical log on successful write
              console.log(
                `[Worker] Recorded ${successful.length} uptime check(s) to ClickHouse`,
              );
            }
          } catch (error) {
            console.error("[Worker] Failed to persist uptime batch", error);
            // Continue to ACK even if ClickHouse fails - prevents PEL growth
            // Failed checks will be retried on next publisher cycle
          } finally {
            // OBSERVABILITY: Why failed checks are ACKed
            // - Failed HTTP checks are ACKed to prevent PEL growth
            // - PEL growth would cause memory issues and require manual Redis intervention
            // - Publisher re-enqueues all active websites every 3 minutes
            // - Failed checks will be retried automatically on next publisher cycle
            // - This ensures system continues running even if some checks fail
            //
            // OBSERVABILITY: Why retries happen via publisher, not Redis
            // - Redis Streams are a transient queue, not a retry mechanism
            // - Publisher is the source of truth for what should be checked
            // - Publisher re-enqueues based on database state (isActive websites)
            // - This allows dynamic website activation/deactivation without Redis cleanup
            //
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
                // Log ACK failures but don't throw - message will be reclaimed by PEL auto-heal
                // Redis disconnects are handled gracefully - operation will retry
                console.error(
                  "[Worker] Failed to ACK messages (will be reclaimed by PEL auto-heal):",
                  ackError,
                );
              }
            }
          }
        }
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
