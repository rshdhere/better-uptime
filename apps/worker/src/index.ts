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
  // Liveness signal must be updated whenever ClickHouse successfully accepts a batch
  let lastSuccessfulWriteAt: number | null = null;

  // Helper function to mark successful ClickHouse write
  // MUST be called whenever ClickHouse successfully accepts a batch:
  // - fresh messages
  // - reclaimed (PEL) messages
  // - partial batches (even if some messages failed HTTP checks)
  function markWriteSuccess(): void {
    lastSuccessfulWriteAt = Date.now();
  }

  // PEL monitoring - track previous count to detect non-decreasing condition
  let previousPelCount: number = 0;
  let pelNonDecreasingSince: number | null = null;
  let pelCriticalLoggedAt: number | null = null;

  setInterval(
    async () => {
      try {
        const pelInfo = await xPendingInfo(REGION_ID);
        const currentPelCount = pelInfo.pending;

        if (currentPelCount > 0) {
          // Check if PEL count is NOT decreasing
          if (currentPelCount >= previousPelCount) {
            // PEL is not decreasing - start tracking
            if (pelNonDecreasingSince === null) {
              pelNonDecreasingSince = Date.now();
            }

            const timeNonDecreasing = Date.now() - pelNonDecreasingSince;
            const oldestIdleMs = pelInfo.oldestIdleMs ?? 0;
            const oldestIdleSeconds = Math.floor(oldestIdleMs / 1000);

            // CRITICAL: Only log if PEL reclaim ran, pending count did NOT decrease,
            // and condition persisted >30 minutes (1800s)
            if (timeNonDecreasing > 1_800_000) {
              // 30 minutes
              const now = Date.now();
              // Only log once per 30-minute window to avoid spam
              if (
                pelCriticalLoggedAt === null ||
                now - pelCriticalLoggedAt > 1_800_000
              ) {
                console.error(
                  `[Worker] PEL CRITICAL: ${currentPelCount} pending message(s) not decreasing for >30 minutes, oldest idle: ${oldestIdleSeconds}s`,
                );
                pelCriticalLoggedAt = now;
              }
            }
          } else {
            // PEL is decreasing - reset tracking
            pelNonDecreasingSince = null;
            pelCriticalLoggedAt = null;
          }
        } else {
          // PEL is clear - reset all tracking
          pelNonDecreasingSince = null;
          pelCriticalLoggedAt = null;
        }

        previousPelCount = currentPelCount;
      } catch (error) {
        // Log error but don't crash - monitoring failures shouldn't stop processing
        console.error("[Worker] Failed to check PEL status:", error);
      }
    },
    5 * 60 * 1000,
  ); // Every 5 mins

  // WORKER SELF-LIVENESS WATCHDOG:
  // Monitor last successful ClickHouse write to detect worker stalls
  // LOG ONLY - never exit process (no self-DDoS via restarts)
  setInterval(
    () => {
      if (lastSuccessfulWriteAt === null) {
        // No writes yet - this is OK on startup
        return;
      }

      const timeSinceLastWrite = Date.now() - lastSuccessfulWriteAt;
      const timeSinceLastWriteMinutes = Math.floor(timeSinceLastWrite / 60_000);

      // CRITICAL: Log if no writes for >15 minutes, but NEVER exit process
      // PM2 restarts must NOT be relied upon for correctness
      if (timeSinceLastWrite > 900_000) {
        // 15 minutes
        console.error(
          `[Worker] LIVENESS WARNING: No ClickHouse writes for ${timeSinceLastWriteMinutes} minutes. Worker may be stalled.`,
        );
        // DO NOT call process.exit() - allow worker to self-heal
      }
    },
    2 * 60 * 1000,
  ); // Check every 2 minutes

  // SINGLE MESSAGE PIPELINE:
  // Unified processing function for both fresh and reclaimed messages
  // This ensures zero code duplication and consistent behavior
  //
  // ARCHITECTURAL INVARIANTS (NON-NEGOTIABLE):
  // 1. ACK SAFETY: Every message is ACKed exactly once, even if HTTP/ClickHouse fails
  // 2. CLICKHOUSE LIVENESS: Liveness updates when ClickHouse accepts a request (not data quality)
  // 3. NO EARLY RETURNS: All ACKs happen in finally block - no code path bypasses ACK
  // 4. IDEMPOTENT: Publisher re-enqueues ensure retries; Redis is transient queue
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

    // Collect all message IDs for ACK (includes both valid and failed checks)
    const allMessageIds: string[] = [];
    // Collect successful events for ClickHouse write
    const eventsToRecord: UptimeEventRecord[] = [];

    // Process valid messages
    if (validMessages.length > 0) {
      const results = await Promise.allSettled(
        validMessages.map((message) =>
          checkWebsite(message.event.url, message.event.id),
        ),
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const message = validMessages[i];
        if (!message) continue;

        // All valid messages must be ACKed regardless of check result
        allMessageIds.push(message.id);

        if (result?.status === "fulfilled") {
          eventsToRecord.push(result.value);
        } else {
          console.error(
            `[Worker] ${logPrefix}: Failed to check website for message ${message.id}`,
            result?.reason,
          );
        }
      }
    }

    // CLICKHOUSE LIVENESS INVARIANT (NON-NEGOTIABLE):
    // Worker liveness is defined as "ClickHouse accepted a request"
    // Liveness must NOT depend on:
    // - number of rows
    // - successful HTTP checks
    // - HTTP status codes (403, 500, etc.)
    // - fresh vs reclaimed messages
    // - valid vs invalid websites
    // CRITICAL: recordUptimeEvents() is called UNCONDITIONALLY for every batch
    // Even an empty array proves ClickHouse is reachable (via ensureSchema())
    try {
      // Persist uptime events to ClickHouse (single source of truth)
      // ALWAYS called, even with empty array - liveness = ClickHouse reachability
      await recordUptimeEvents(eventsToRecord);
      // CRITICAL: Update liveness signal whenever ClickHouse successfully accepts a request
      // This must happen for:
      // - fresh batches
      // - reclaimed (PEL) batches
      // - partial batches (some HTTP checks failed)
      // - empty batches (all HTTP checks failed OR all websites invalid)
      // Liveness tracks system health (ClickHouse availability), not data quality
      markWriteSuccess(); // ← liveness = ClickHouse accepted request
      if (eventsToRecord.length > 0) {
        const action = isReclaimed ? "Replayed" : "Recorded";
        console.log(
          `[Worker] ${action} ${eventsToRecord.length} uptime check(s) to ClickHouse`,
        );
      }
    } catch (error) {
      console.error(
        `[Worker] ${logPrefix}: Failed to persist uptime batch`,
        error,
      );
      // Continue to ACK even if ClickHouse fails - prevents PEL growth
      // Failed checks will be retried on next publisher cycle
      // Liveness is NOT updated on ClickHouse failure (correct behavior)
    }

    // ACK SAFETY INVARIANT (NON-NEGOTIABLE):
    // Every message that enters the worker must be ACKed exactly once.
    // ACK must happen even if:
    // - HTTP fails
    // - ClickHouse fails
    // - Redis disconnects mid-batch
    // PEL growth must be impossible by construction.
    // ACK is in the main flow (not finally) because ClickHouse failure should NOT block ACK
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
        // Continue to PEL reclaim below (maintenance runs every iteration)
      }

      // 2. PEL RECLAIM MUST NEVER STARVE:
      // PEL reclaim is maintenance, not a fallback.
      // Reclaim MUST run every loop iteration, even when fresh messages exist.
      // Reclaim MUST be rate-limited (small batch) so it cannot starve fresh work.
      // Fresh messages always have priority, but reclaim always runs.
      const reclaimed = await xAutoClaimStale({
        consumerGroup: REGION_ID,
        workerId: WORKER_ID,
        minIdleMs: 300_000, // 5 minutes - reclaim messages idle > 5 mins
        count: 5, // Small batch size to prevent starving fresh work
        maxTotalReclaim: 10, // Max 10 messages per cycle (rate-limited maintenance)
      });

      if (reclaimed.length > 0) {
        await processMessages(reclaimed, true);
      }

      // Continue loop to check for fresh messages again
      // PEL reclaim will run again on next iteration (maintenance, not fallback)
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
