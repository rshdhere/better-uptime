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
  xForceAckStalePel,
} from "@repo/streams";
import { prismaClient } from "@repo/store";
import axios from "axios";
import process from "node:process";

// Timeout for Prisma queries - prevents hanging on slow/dead database connections
const PRISMA_QUERY_TIMEOUT_MS = 10_000;
const WEBSITE_CHECK_TIMEOUT_MS = 10_000;
// Hard deadline guard in case Axios timeout is not honored by runtime/network stack.
const WEBSITE_CHECK_HARD_TIMEOUT_MS = 12_000;
const MAIN_LOOP_ERROR_RETRY_DELAY_MS = 2_000;

/**
 * Race a promise against a client-side timeout.
 * Prevents indefinite hangs on external service calls (Prisma, etc.).
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

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
  const abortController = new AbortController();
  const abortTimeout = setTimeout(() => {
    abortController.abort();
  }, WEBSITE_CHECK_TIMEOUT_MS);

  try {
    const res = await withTimeout(
      axios.get(url, {
        signal: abortController.signal,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          "User-Agent":
            "Uptique/1.0 (Uptime Monitor; https://uptique.raashed.xyz)",
        },
      }),
      WEBSITE_CHECK_HARD_TIMEOUT_MS,
      `Website check ${websiteId}`,
    );

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
  } finally {
    clearTimeout(abortTimeout);
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
  // CRITICAL: Initialize to Date.now() to prevent false warnings on startup
  let lastSuccessfulWriteAt: number = Date.now();
  // Separate tracker for main loop iterations - detects frozen worker loops
  let lastLoopIterationAt: number = Date.now();

  // Helper function to mark main loop is alive
  // Called at the end of every loop iteration, even during idle periods
  function markLoopAlive(): void {
    lastLoopIterationAt = Date.now();
  }

  // Helper function to mark successful ClickHouse write
  // MUST be called whenever ClickHouse successfully accepts a batch:
  // - fresh messages
  // - reclaimed (PEL) messages
  // - partial batches (even if some messages failed HTTP checks)
  let writeSuccessCount = 0;
  function markWriteSuccess(): void {
    lastSuccessfulWriteAt = Date.now();
    writeSuccessCount++;
    // Log every 10 successful writes for debugging without spam
    if (writeSuccessCount === 1 || writeSuccessCount % 10 === 0) {
      console.log(
        `[Worker] Liveness: ClickHouse write #${writeSuccessCount} confirmed at ${new Date().toISOString()}`,
      );
    }
  }

  // PEL monitoring - track previous count to detect non-decreasing condition
  let previousPelCount: number = 0;
  let pelNonDecreasingSince: number | null = null;
  let pelCriticalLoggedAt: number | null = null;
  // OVERLAP GUARD: Prevents concurrent PEL monitor executions.
  // setInterval does NOT await async callbacks — if a previous invocation is still
  // running when the next interval fires, they run concurrently, accumulating
  // Redis connections and memory. This flag serializes execution.
  let pelMonitorRunning = false;

  setInterval(
    async () => {
      if (pelMonitorRunning) {
        console.warn(
          "[Worker] PEL monitor skipped: previous invocation still running",
        );
        return;
      }
      pelMonitorRunning = true;
      try {
        const pelInfo = await xPendingInfo(REGION_ID);
        const currentPelCount = pelInfo.pending;

        if (currentPelCount > 0) {
          const oldestIdleMs = pelInfo.oldestIdleMs ?? 0;
          const oldestIdleSeconds = Math.floor(oldestIdleMs / 1000);

          // SAFETY MECHANISM: Force-clear messages stuck for > 1 hour
          // These messages have failed processing repeatedly and will never succeed
          // The publisher will re-enqueue the website on its next cycle
          if (oldestIdleMs > 3_600_000) {
            // 1 hour
            console.warn(
              `[Worker] PEL has message(s) idle for ${oldestIdleSeconds}s (>1 hour), force-clearing...`,
            );
            const clearedCount = await xForceAckStalePel({
              consumerGroup: REGION_ID,
              minIdleMs: 3_600_000, // 1 hour
              maxCount: 50, // Clear up to 50 per cycle
            });
            if (clearedCount > 0) {
              console.warn(
                `[Worker] Force-cleared ${clearedCount} stuck message(s) from PEL`,
              );
            }
          }

          // Check if PEL count is NOT decreasing
          if (currentPelCount >= previousPelCount) {
            // PEL is not decreasing - start tracking
            if (pelNonDecreasingSince === null) {
              pelNonDecreasingSince = Date.now();
            }

            const timeNonDecreasing = Date.now() - pelNonDecreasingSince;

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
      } finally {
        pelMonitorRunning = false;
      }
    },
    5 * 60 * 1000,
  ); // Every 5 mins

  // WORKER SELF-LIVENESS WATCHDOG:
  // Monitor main loop health and force recovery when stuck.
  //
  // RATIONALE FOR process.exit():
  // A stuck `await` (zombie Redis connection, hung Prisma query) CANNOT be unwound
  // from within the same process. The only recovery is to restart the process.
  // PM2 with exp_backoff_restart_delay prevents restart storms.
  //
  // With client-side timeouts on all Redis/DB operations, the main loop should
  // never freeze for more than ~30s. A 5-minute threshold means something is
  // genuinely unrecoverable.
  setInterval(
    () => {
      const now = Date.now();
      const timeSinceLastWrite = now - lastSuccessfulWriteAt;
      const timeSinceLastWriteMinutes = Math.floor(timeSinceLastWrite / 60_000);
      const timeSinceLastLoop = now - lastLoopIterationAt;
      const timeSinceLastLoopMinutes = Math.floor(timeSinceLastLoop / 60_000);

      // CRITICAL: If main loop is frozen for >5 minutes, force restart.
      // A stuck `await` cannot self-heal — only process restart can recover.
      // PM2 exp_backoff_restart_delay prevents restart storms.
      if (timeSinceLastLoop > 300_000) {
        // 5 minutes
        console.error(
          `[Worker] CRITICAL: Main loop not responding for ${timeSinceLastLoopMinutes} minutes. Forcing process exit for PM2 restart.`,
        );
        process.exit(1);
      }

      // WARN if no ClickHouse writes for >30 minutes (informational, no exit)
      if (timeSinceLastWrite > 1_800_000) {
        // 30 minutes
        console.error(
          `[Worker] LIVENESS WARNING: No ClickHouse writes for ${timeSinceLastWriteMinutes} minutes. Worker may be stalled.`,
        );
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
    // CRITICAL: Each validation is wrapped in try-catch to prevent PEL growth
    // If Prisma fails (DB connection issues), message is treated as invalid and ACKed
    // This prevents messages from being stuck in PEL indefinitely
    const validMessages: typeof messages = [];
    const invalidMessageIds: string[] = [];

    for (const message of messages) {
      try {
        const website = await withTimeout(
          prismaClient.website.findUnique({
            where: { id: message.event.id },
          }),
          PRISMA_QUERY_TIMEOUT_MS,
          `Prisma findUnique(${message.event.id})`,
        );

        if (!website || !website.isActive) {
          invalidMessageIds.push(message.id);
          continue;
        }

        validMessages.push(message);
      } catch (error) {
        // GUARDRAIL: Prisma failures must NOT cause PEL growth
        // Treat validation failures as invalid - safe to ACK
        // The publisher will re-enqueue active websites on the next cycle
        console.error(
          `[Worker] ${logPrefix}: Failed to validate website ${message.event.id}, treating as invalid:`,
          error instanceof Error ? error.message : String(error),
        );
        invalidMessageIds.push(message.id);
      }
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

      for (const [index, message] of validMessages.entries()) {
        allMessageIds.push(message.id);
        const result = results[index];

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
      // RECOVERY SLEEP: Prevent tight busy-looping when errors happen rapidly.
      // Without this, a persistent error (Redis down, etc.) causes thousands of
      // iterations per second, flooding logs and burning CPU.
      // 2s is long enough to prevent busy-loop, short enough to recover quickly.
      await new Promise((resolve) =>
        setTimeout(resolve, MAIN_LOOP_ERROR_RETRY_DELAY_MS),
      );
    }

    // CRITICAL: No artificial delays - rely only on Redis BLOCK for backpressure
    // XREADGROUP with BLOCK: 1000 will handle server-side blocking
    // This prevents unnecessary CPU usage and allows immediate processing when messages arrive

    // CRITICAL: Mark loop alive after each iteration
    // This proves the worker is running even during idle periods with no messages
    markLoopAlive();
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
