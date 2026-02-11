import { createClient } from "redis";
import {
  REDIS_USERNAME,
  REDIS_PASSWORD,
  REDIS_HOST,
  REDIS_PORT,
  STREAM_NAME,
} from "@repo/config";

export interface WebsiteEvent {
  url: string;
  id: string;
}

export interface ReadGroupOptions {
  consumerGroup: string;
  workerId: string;
}

export interface AckOptions {
  consumerGroup: string;
  streamId: string;
}

export interface AckBulkOptions {
  consumerGroup: string;
  eventIds: string[];
}

export interface StreamMessage {
  id: string;
  message: Record<string, string>;
}

export interface StreamReadResponse {
  name: string;
  messages: StreamMessage[];
}

type MessageType = {
  id: string;
  event: {
    url: string;
    id: string;
  };
};

export interface AutoClaimOptions {
  consumerGroup: string;
  workerId: string;
  /**
   * Minimum idle time in milliseconds before a pending message is considered
   * stale enough to be auto-claimed by a different consumer.
   */
  minIdleMs: number;
  /**
   * Maximum number of messages to claim in a single batch.
   */
  count: number;
  /**
   * Maximum total messages to reclaim in a single cycle.
   * Prevents long PEL drains from starving XREADGROUP.
   */
  maxTotalReclaim?: number;
}

// In test environment, skip Redis connection and use mocks
const isTestEnv = process.env.NODE_ENV === "test";

let client: ReturnType<typeof createClient> | null = null;

/**
 * Race a promise against a client-side timeout.
 * CRITICAL: Prevents indefinite hangs when Redis connection is in a zombie state
 * (TCP connection appears open but is actually dead - BLOCK commands never return).
 *
 * Unlike Promise.race, this properly handles the losing promise's rejection
 * to prevent unhandled rejection crashes.
 */
function withRedisTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`[Redis] ${label} timed out after ${timeoutMs}ms`));
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

// Client-side timeout constants
// These protect against zombie TCP connections where server-side BLOCK never returns
const XREADGROUP_TIMEOUT_MS = 5_000; // BLOCK is 1000ms, 5s gives generous margin
const XAUTOCLAIM_TIMEOUT_MS = 10_000; // Non-blocking but may scan large PELs
const REDIS_COMMAND_TIMEOUT_MS = 10_000; // General Redis command timeout

if (!isTestEnv) {
  const redisClient = createClient({
    username: REDIS_USERNAME,
    password: REDIS_PASSWORD,
    socket: {
      host: REDIS_HOST,
      port: Number(REDIS_PORT),
      // CRITICAL: TCP keepAlive detects zombie connections at the OS level.
      // Without this, a dead connection can hang BLOCK commands indefinitely.
      // Dead connections are detected within ~1-2 min depending on OS settings.
      keepAlive: true,
      keepAliveInitialDelay: 15_000,
      // Timeout for initial TCP connection establishment
      connectTimeout: 10_000,
      // Disable Nagle's algorithm for lower latency on small Redis commands
      noDelay: true,
      // CRITICAL: Never give up reconnecting. The previous limit of 10 retries
      // caused permanent worker death after brief Redis outages.
      // Exponential backoff: 200ms, 400ms, 800ms, ... capped at 30s
      reconnectStrategy: (retries) => {
        const delay = Math.min(retries * 200, 30_000);
        if (retries % 10 === 0) {
          // Log every 10th attempt to avoid spam but maintain visibility
          console.warn(
            `Redis: Reconnecting in ${delay}ms (attempt ${retries})`,
          );
        }
        return delay;
      },
    },
    // Ping Redis periodically to detect zombie connections from the application layer.
    // If a PING doesn't get a response, node-redis marks the connection as dead
    // and triggers reconnection. This is the most reliable zombie detection mechanism.
    pingInterval: 30_000,
  });

  redisClient.on("error", (err) => {
    // GUARDRAIL: Redis errors must never crash the worker
    // Log error but allow automatic reconnection to handle it
    console.error("Redis Client Error:", err.message);
    // Don't exit - reconnect strategy NEVER gives up
  });

  redisClient.on("connect", () => {
    console.log("Redis: Connected successfully");
  });

  redisClient.on("reconnecting", () => {
    console.log("Redis: Reconnecting...");
  });

  redisClient.on("ready", () => {
    console.log("Redis: Connection ready");
  });

  // CRITICAL: Set client to redisClient BEFORE connecting.
  // This ensures the reconnect strategy can restore the connection even if
  // the initial connect() fails. Previously, client was set to null on failure,
  // making the worker permanently broken after a transient Redis outage at startup.
  client = redisClient;

  try {
    await redisClient.connect();
    console.log("Redis: Initial connection established");
  } catch (error) {
    console.error("Failed to initial connect to Redis:", error);
    // DON'T set client = null — reconnect strategy will keep retrying.
    // The client instance is still valid and will auto-reconnect.
    console.log(
      "Redis: Will keep retrying via reconnect strategy in background",
    );
  }
}

/**
 * Ensure consumer group exists, creating it with MKSTREAM if needed.
 *
 * CONSUMER GROUP SAFETY:
 * - Idempotent: Safe to call multiple times
 * - Creates stream and group if missing (MKSTREAM)
 * - Ignores BUSYGROUP (group already exists)
 * - Called before XREADGROUP and XAUTOCLAIM operations
 * - Never throws - all errors are logged but don't crash
 *
 * This prevents crashes when stream/group doesn't exist yet (e.g., first run).
 */
export async function ensureConsumerGroup(
  consumerGroup: string,
): Promise<void> {
  if (isTestEnv || !client) {
    return;
  }

  try {
    // XGROUP CREATE with MKSTREAM creates both stream and group if missing
    // This is idempotent - if group exists, it returns BUSYGROUP which we ignore
    await withRedisTimeout(
      client.xGroupCreate(
        STREAM_NAME,
        consumerGroup,
        "0", // Start from beginning
        {
          MKSTREAM: true, // Create stream if it doesn't exist
        },
      ),
      REDIS_COMMAND_TIMEOUT_MS,
      "xGroupCreate",
    );
  } catch (error: unknown) {
    // BUSYGROUP means group already exists - this is fine, ignore it (idempotent)
    // Other errors (like connection issues) are logged but don't throw
    if (error instanceof Error && error.message.includes("BUSYGROUP")) {
      // Group already exists, no action needed - this is expected and safe
      return;
    }
    // For other errors (connection issues, etc.), log but don't throw
    // The actual XREADGROUP/XAUTOCLAIM will handle connection errors gracefully
    // This ensures consumer group creation failures don't crash the worker
    console.warn(
      `[ensureConsumerGroup] Could not ensure group ${consumerGroup} exists:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function xAddBulk(websites: WebsiteEvent[]) {
  // Mock in test environment
  if (isTestEnv) {
    return;
  }

  if (!client) {
    console.warn("Redis client not initialized, skipping xAddBulk");
    return;
  }

  // Avoid unbounded Promise.all fan-out (can freeze machines with large website counts).
  // Use Redis pipelining in bounded batches.
  // CRITICAL: Use MAXLEN ~ to bound stream size. Redis is a transient queue, not history.
  // Approximate trimming (~) is faster than exact trimming and prevents unbounded growth.
  const batchSize = 250;
  for (let i = 0; i < websites.length; i += batchSize) {
    const batch = websites.slice(i, i + batchSize);

    try {
      const multi = client.multi();
      for (const website of batch) {
        multi.xAdd(STREAM_NAME, "*", { url: website.url, id: website.id });
      }
      const res = await multi.exec();
      // node-redis returns null if disconnected - fail gracefully
      if (res === null) {
        console.warn("[xAddBulk] Redis disconnected, skipping batch");
        // Don't throw - allow retry on next publisher cycle
        continue;
      }

      // CRITICAL: Trim stream after each batch to keep it bounded
      // MAXLEN ~ 8000: Keep ~8k entries, approximate trim for performance
      // This ensures Redis only stores recent messages, not full history
      // Do this after each batch to prevent unbounded growth
      try {
        // Use sendCommand for XTRIM - redis v5 API may vary, sendCommand is reliable
        await withRedisTimeout(
          client.sendCommand(["XTRIM", STREAM_NAME, "MAXLEN", "~", "8000"]),
          REDIS_COMMAND_TIMEOUT_MS,
          "xTrim",
        );
      } catch (error) {
        // Log but don't fail - trimming is best-effort
        // Stream will be trimmed on next batch or by periodic maintenance
        // Redis disconnects are handled gracefully
        console.warn("[xAddBulk] Failed to trim stream:", error);
      }
    } catch (error) {
      // GUARDRAIL: Redis disconnects must never crash the publisher
      // Log error and continue - failed batches will be retried on next cycle
      console.error("[xAddBulk] Error processing batch:", error);
      // Don't throw - allow remaining batches to be processed
    }
  }
}

export async function xReadGroup(
  options: ReadGroupOptions,
): Promise<MessageType[]> {
  // Mock in test environment
  if (isTestEnv) {
    return [];
  }

  if (!client) {
    console.warn("Redis client not initialized, returning empty messages");
    return [];
  }

  const operationKey = "xReadGroup";
  const failureState = redisFailureState.get(operationKey);

  // REDIS FAILURE BACKOFF:
  // If recent failures occurred, back off to avoid busy-looping when Redis is unavailable
  // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms, max 5000ms
  if (failureState && failureState.failures > 0) {
    const backoffMs = Math.min(
      BASE_BACKOFF_MS * Math.pow(2, failureState.failures - 1),
      MAX_BACKOFF_MS,
    );
    const timeSinceLastFailure = Date.now() - failureState.lastFailureAt;
    if (timeSinceLastFailure < backoffMs) {
      // Still in backoff period - return empty to avoid busy-loop
      return [];
    }
  }

  try {
    // CRITICAL: Ensure consumer group exists before reading
    // This prevents crashes when stream/group doesn't exist yet (e.g., first run)
    await ensureConsumerGroup(options.consumerGroup);

    // CRITICAL: Client-side timeout wraps the BLOCK call.
    // BLOCK: 1000 means Redis waits up to 1s server-side.
    // If the TCP connection is zombie, the BLOCK never returns.
    // 5s client-side timeout guarantees the main loop never freezes.
    const response = (await withRedisTimeout(
      client.xReadGroup(
        options.consumerGroup,
        options.workerId,
        {
          key: STREAM_NAME,
          id: ">",
        },
        {
          COUNT: 5,
          // Prefer server-side blocking over client-side polling loops.
          // This reduces CPU and log spam when the stream is idle.
          BLOCK: 1000,
        },
      ),
      XREADGROUP_TIMEOUT_MS,
      "xReadGroup(BLOCK 1000)",
    )) as StreamReadResponse[];

    // Reset failure state on successful operation
    redisFailureState.set(operationKey, { failures: 0, lastFailureAt: 0 });

    if (!response || response.length === 0 || !response[0]?.messages) {
      return [];
    }

    // CRITICAL FIX: Identify malformed messages (missing url or id)
    // These must be ACKed immediately to prevent infinite PEL loops
    const malformedMessageIds: string[] = [];
    const validMessages: StreamMessage[] = [];

    for (const streamMessage of response[0].messages) {
      if (streamMessage.message.url && streamMessage.message.id) {
        validMessages.push(streamMessage);
      } else {
        malformedMessageIds.push(streamMessage.id);
        console.warn(
          `[xReadGroup] Malformed message ${streamMessage.id}: missing url or id, will ACK to clear from PEL`,
        );
      }
    }

    // ACK malformed messages immediately to prevent PEL growth
    if (malformedMessageIds.length > 0) {
      try {
        await Promise.allSettled(
          malformedMessageIds.map((msgId) =>
            client!.xAck(STREAM_NAME, options.consumerGroup, msgId),
          ),
        );
        console.log(
          `[xReadGroup] ACKed ${malformedMessageIds.length} malformed message(s) from PEL`,
        );
      } catch (ackError) {
        console.error(
          `[xReadGroup] Failed to ACK malformed messages:`,
          ackError,
        );
      }
    }

    const messages: MessageType[] = validMessages.map(
      (streamMessage: StreamMessage) => ({
        id: streamMessage.id,
        event: {
          url: streamMessage.message.url as string,
          id: streamMessage.message.id as string,
        },
      }),
    );

    return messages;
  } catch (error) {
    // REDIS FAILURE BACKOFF: Track failures and implement exponential backoff
    const currentFailures = failureState?.failures ?? 0;
    redisFailureState.set(operationKey, {
      failures: currentFailures + 1,
      lastFailureAt: Date.now(),
    });

    // Log error but don't crash - allow retry on next iteration
    // Connection errors will be handled by reconnect strategy
    console.error("Error reading from stream:", error);
    return [];
  }
}

// In-memory cursor storage per consumer group for XAUTOCLAIM
// CRITICAL: This allows us to advance through large PELs incrementally
// Key: consumerGroup, Value: nextStartId cursor
const xAutoClaimCursors = new Map<string, string>();

// Redis failure backoff state
// Tracks consecutive failures per operation type to implement exponential backoff
// Key: operation type, Value: { failures: number, lastFailureAt: number }
const redisFailureState = new Map<
  string,
  { failures: number; lastFailureAt: number }
>();

// Maximum backoff delay (5 seconds)
const MAX_BACKOFF_MS = 5000;
// Base backoff delay (100ms)
const BASE_BACKOFF_MS = 100;

// Use XAUTOCLAIM to take over *stale* pending messages from ANY consumer in
// the group and assign them to the current worker. This is the robust way to
// recover messages that were delivered to a dead consumer and never acked.
// CRITICAL: This prevents PEL growth and ensures messages are never lost.
//
// CURSOR HANDLING:
// - Persists nextStartId across calls to fully drain large PELs
// - Loops until no messages are returned (PEL fully drained)
// - Resets cursor to "0-0" when no messages found (fresh start next cycle)
export async function xAutoClaimStale(
  options: AutoClaimOptions,
): Promise<MessageType[]> {
  // Mock in test environment
  if (isTestEnv) {
    return [];
  }

  if (!client) {
    console.warn("Redis client not initialized, returning empty messages");
    return [];
  }

  const operationKey = "xAutoClaimStale";
  const failureState = redisFailureState.get(operationKey);

  // REDIS FAILURE BACKOFF:
  // If recent failures occurred, back off to avoid busy-looping when Redis is unavailable
  if (failureState && failureState.failures > 0) {
    const backoffMs = Math.min(
      BASE_BACKOFF_MS * Math.pow(2, failureState.failures - 1),
      MAX_BACKOFF_MS,
    );
    const timeSinceLastFailure = Date.now() - failureState.lastFailureAt;
    if (timeSinceLastFailure < backoffMs) {
      // Still in backoff period - return empty to avoid busy-loop
      return [];
    }
  }

  try {
    // CRITICAL: Ensure consumer group exists before claiming
    await ensureConsumerGroup(options.consumerGroup);

    // Get or initialize cursor for this consumer group
    let startId = xAutoClaimCursors.get(options.consumerGroup) || "0-0";
    const allMessages: MessageType[] = [];
    const maxTotalReclaim = options.maxTotalReclaim ?? 200; // Default: 200 messages per cycle

    // CRITICAL: Loop XAUTOCLAIM until no messages are returned OR max total reached
    // This fully drains large PELs incrementally over multiple calls
    // NON-BLOCKING: Limits total reclaim per cycle to prevent starving XREADGROUP
    while (allMessages.length < maxTotalReclaim) {
      // node-redis XAUTOCLAIM returns: [messages, nextStartId]
      // CRITICAL: Client-side timeout prevents zombie connection hangs
      const result = (await withRedisTimeout(
        client.xAutoClaim(
          STREAM_NAME,
          options.consumerGroup,
          options.workerId,
          options.minIdleMs,
          startId,
          {
            COUNT: options.count,
          },
        ),
        XAUTOCLAIM_TIMEOUT_MS,
        "xAutoClaimStale",
      )) as unknown as { messages: StreamMessage[]; nextId: string };

      const claimedMessages = result?.messages ?? null;
      const nextId = result?.nextId ?? "0-0";

      // If no messages returned, we've drained the PEL for this cursor position
      if (!claimedMessages || claimedMessages.length === 0) {
        // Reset cursor to "0-0" for next cycle (fresh start)
        xAutoClaimCursors.set(options.consumerGroup, "0-0");
        break;
      }

      // Update cursor to nextStartId for next iteration
      xAutoClaimCursors.set(options.consumerGroup, nextId);

      // CRITICAL FIX: Identify malformed messages (missing url or id)
      // These must be ACKed immediately to prevent infinite PEL loops
      const malformedMessageIds: string[] = [];
      const validClaimedMessages: StreamMessage[] = [];

      for (const streamMessage of claimedMessages) {
        if (streamMessage.message.url && streamMessage.message.id) {
          validClaimedMessages.push(streamMessage);
        } else {
          // Message is malformed - mark for immediate ACK
          malformedMessageIds.push(streamMessage.id);
          console.warn(
            `[xAutoClaimStale] Malformed message ${streamMessage.id}: missing url or id, will ACK to clear from PEL`,
          );
        }
      }

      // ACK malformed messages immediately to prevent PEL growth
      // These messages can never be processed, so ACKing is the only safe action
      if (malformedMessageIds.length > 0) {
        try {
          await Promise.allSettled(
            malformedMessageIds.map((msgId) =>
              client!.xAck(STREAM_NAME, options.consumerGroup, msgId),
            ),
          );
          console.log(
            `[xAutoClaimStale] ACKed ${malformedMessageIds.length} malformed message(s) from PEL`,
          );
        } catch (ackError) {
          // Log but don't fail - message will be reclaimed again
          console.error(
            `[xAutoClaimStale] Failed to ACK malformed messages:`,
            ackError,
          );
        }
      }

      // Map valid claimed messages to our format
      const messages: MessageType[] = validClaimedMessages.map(
        (streamMessage: StreamMessage) => ({
          id: streamMessage.id,
          event: {
            url: streamMessage.message.url as string,
            id: streamMessage.message.id as string,
          },
        }),
      );

      allMessages.push(...messages);

      // If we got fewer messages than requested, we've reached the end
      // Update cursor and break to allow next cycle to continue
      if (claimedMessages.length < options.count) {
        xAutoClaimCursors.set(options.consumerGroup, nextId);
        break;
      }

      // If we've reached max total reclaim limit, stop and continue next cycle
      // This prevents long PEL drains from starving XREADGROUP
      if (allMessages.length >= maxTotalReclaim) {
        xAutoClaimCursors.set(options.consumerGroup, nextId);
        break;
      }

      // Continue with next cursor position
      startId = nextId;
    }

    // Reset failure state on successful operation
    redisFailureState.set(operationKey, { failures: 0, lastFailureAt: 0 });

    return allMessages;
  } catch (error) {
    // REDIS FAILURE BACKOFF: Track failures and implement exponential backoff
    const currentFailures = failureState?.failures ?? 0;
    redisFailureState.set(operationKey, {
      failures: currentFailures + 1,
      lastFailureAt: Date.now(),
    });

    // Log error but don't crash - allow retry on next iteration
    // Connection errors will be handled by reconnect strategy
    // Reset cursor on error to start fresh next time
    xAutoClaimCursors.set(options.consumerGroup, "0-0");
    console.error("Error auto-claiming stale messages:", error);
    return [];
  }
}

async function xAck(options: AckOptions): Promise<number> {
  // Mock in test environment
  if (isTestEnv) {
    return 1;
  }

  if (!client) {
    console.warn("Redis client not initialized, skipping ack");
    return 0;
  }

  try {
    const result = await withRedisTimeout(
      client.xAck(STREAM_NAME, options.consumerGroup, options.streamId),
      REDIS_COMMAND_TIMEOUT_MS,
      "xAck",
    );
    return result;
  } catch (error) {
    // Log error but don't throw - ACK failures shouldn't crash the worker
    // The message will remain in PEL and be reclaimed later
    console.error("Error acknowledging message:", error);
    return 0;
  }
}

export async function xAckBulk(options: AckBulkOptions) {
  // Mock in test environment
  if (isTestEnv) {
    return;
  }

  // CRITICAL: Use allSettled to ensure all ACKs are attempted even if some fail
  // Individual ACK failures are logged but don't prevent other ACKs
  await Promise.allSettled(
    options.eventIds.map((eventId) =>
      xAck({ consumerGroup: options.consumerGroup, streamId: eventId }),
    ),
  );
}

export interface PendingInfo {
  pending: number;
  oldestIdleMs: number | null;
  consumers: Array<{
    name: string;
    pending: number;
  }>;
}

/**
 * Check Redis PEL (Pending Entry List) status for monitoring.
 * Alert if pending > 0 or oldest idle > 3 mins.
 */
export async function xPendingInfo(
  consumerGroup: string,
): Promise<PendingInfo> {
  // Mock in test environment
  if (isTestEnv) {
    return {
      pending: 0,
      oldestIdleMs: null,
      consumers: [],
    };
  }

  if (!client) {
    console.warn("Redis client not initialized, returning empty pending info");
    return {
      pending: 0,
      oldestIdleMs: null,
      consumers: [],
    };
  }

  try {
    // Get summary (pending count, first/last IDs, consumers)
    const summary = (await withRedisTimeout(
      client.xPending(STREAM_NAME, consumerGroup),
      REDIS_COMMAND_TIMEOUT_MS,
      "xPending(summary)",
    )) as unknown as {
      pending: number;
      firstId: string | null;
      lastId: string | null;
      consumers: Array<{ name: string; deliveriesCounter: number }> | null;
    } | null;

    if (!summary || summary.pending === 0) {
      return {
        pending: 0,
        oldestIdleMs: null,
        consumers: [],
      };
    }

    // Get detailed list to find oldest idle time using sendCommand
    // XPENDING key group start end count
    let oldestIdleMs: number | null = null;
    try {
      const pendingEntries = (await withRedisTimeout(
        client.sendCommand([
          "XPENDING",
          STREAM_NAME,
          consumerGroup,
          "-",
          "+",
          "100",
        ]),
        REDIS_COMMAND_TIMEOUT_MS,
        "xPending(detailed)",
      )) as Array<[string, string, number, number]> | null;

      if (pendingEntries && pendingEntries.length > 0) {
        // XPENDING detailed format: [id, consumer, idleMs, deliveryCount]
        const idleTimes = pendingEntries.map(([, , idleMs]) => idleMs);
        oldestIdleMs = Math.max(...idleTimes);
      }
    } catch (error) {
      // If detailed query fails, we still have summary info
      console.warn(
        "[xPendingInfo] Failed to get detailed pending entries:",
        error,
      );
    }

    // Map consumers from deliveriesCounter to pending
    const consumers =
      summary.consumers?.map((c) => ({
        name: c.name,
        pending: c.deliveriesCounter,
      })) || [];

    return {
      pending: summary.pending,
      oldestIdleMs,
      consumers,
    };
  } catch (error) {
    // GUARDRAIL: PEL monitoring failures must never crash the worker
    // Return empty info on error - monitoring is best-effort
    console.error("Error checking PEL status:", error);
    return {
      pending: 0,
      oldestIdleMs: null,
      consumers: [],
    };
  }
}

export interface ForceAckStalePelOptions {
  consumerGroup: string;
  /**
   * Minimum idle time in milliseconds for a message to be force-ACKed.
   * Messages idle longer than this are considered "stuck" and will be removed.
   * Default: 1 hour (3600000ms)
   */
  minIdleMs: number;
  /**
   * Maximum number of messages to force-ACK in a single call.
   * Prevents overwhelming Redis with bulk ACKs.
   */
  maxCount?: number;
}

/**
 * Force-acknowledge PEL entries that have been stuck for too long.
 *
 * SAFETY MECHANISM:
 * This is a last-resort cleanup for messages that are stuck in PEL indefinitely.
 * Normal flow: messages are claimed via XAUTOCLAIM → processed → ACKed
 * If a message repeatedly fails processing and never gets ACKed, it stays in PEL forever.
 *
 * This function:
 * 1. Queries XPENDING for entries idle longer than minIdleMs
 * 2. Force-ACKs them without processing
 * 3. Logs the cleanup for audit
 *
 * USE SPARINGLY: This discards messages. Only use for very old entries (1+ hours).
 * The publisher will re-enqueue the website on its next cycle anyway.
 *
 * @returns Number of messages force-ACKed
 */
export async function xForceAckStalePel(
  options: ForceAckStalePelOptions,
): Promise<number> {
  // Mock in test environment
  if (isTestEnv) {
    return 0;
  }

  if (!client) {
    console.warn("Redis client not initialized, cannot force-ack stale PEL");
    return 0;
  }

  const maxCount = options.maxCount ?? 100;

  try {
    // CRITICAL: Ensure consumer group exists before querying
    await ensureConsumerGroup(options.consumerGroup);

    // Query XPENDING for detailed entries to find very old ones
    // XPENDING key group start end count
    const pendingEntries = (await withRedisTimeout(
      client.sendCommand([
        "XPENDING",
        STREAM_NAME,
        options.consumerGroup,
        "-",
        "+",
        String(maxCount),
      ]),
      REDIS_COMMAND_TIMEOUT_MS,
      "xForceAckStalePel(xPending)",
    )) as Array<[string, string, number, number]> | null;

    if (!pendingEntries || pendingEntries.length === 0) {
      return 0;
    }

    // Filter entries older than minIdleMs
    // XPENDING detailed format: [id, consumer, idleMs, deliveryCount]
    const staleEntryIds: string[] = [];
    for (const [id, , idleMs] of pendingEntries) {
      if (idleMs >= options.minIdleMs) {
        staleEntryIds.push(id);
      }
    }

    if (staleEntryIds.length === 0) {
      return 0;
    }

    // Force-ACK the stale entries
    const ackResults = await Promise.allSettled(
      staleEntryIds.map((msgId) =>
        client!.xAck(STREAM_NAME, options.consumerGroup, msgId),
      ),
    );

    const ackedCount = ackResults.filter(
      (r) => r.status === "fulfilled" && r.value > 0,
    ).length;

    if (ackedCount > 0) {
      const idleMinutes = Math.floor(options.minIdleMs / 60_000);
      console.warn(
        `[xForceAckStalePel] Force-ACKed ${ackedCount} message(s) idle for >${idleMinutes} minutes`,
      );
    }

    return ackedCount;
  } catch (error) {
    // Log error but don't throw - force-ACK is best-effort cleanup
    console.error("[xForceAckStalePel] Failed to force-ack stale PEL:", error);
    return 0;
  }
}
