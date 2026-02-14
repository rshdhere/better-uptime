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
  minIdleMs: number;
  count: number;
  maxTotalReclaim?: number;
}

const isTestEnv = process.env.NODE_ENV === "test";

let client: ReturnType<typeof createClient> | null = null;

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

const XREADGROUP_TIMEOUT_MS = 5_000;
const XAUTOCLAIM_TIMEOUT_MS = 10_000;
const REDIS_COMMAND_TIMEOUT_MS = 10_000;

if (!isTestEnv) {
  const redisClient = createClient({
    username: REDIS_USERNAME,
    password: REDIS_PASSWORD,
    socket: {
      host: REDIS_HOST,
      port: Number(REDIS_PORT),
      keepAlive: true,
      keepAliveInitialDelay: 15_000,
      connectTimeout: 10_000,
      noDelay: true,
      reconnectStrategy: (retries) => {
        const delay = Math.min(retries * 200, 30_000);
        if (retries % 10 === 0) {
          console.warn(
            `Redis: Reconnecting in ${delay}ms (attempt ${retries})`,
          );
        }
        return delay;
      },
    },
    pingInterval: 30_000,
  });

  redisClient.on("error", (err) => {
    console.error("Redis Client Error:", err.message);
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

  client = redisClient;

  try {
    await redisClient.connect();
    console.log("Redis: Initial connection established");
  } catch (error) {
    console.error("Failed to initial connect to Redis:", error);
    console.log(
      "Redis: Will keep retrying via reconnect strategy in background",
    );
  }
}

export async function ensureConsumerGroup(
  consumerGroup: string,
): Promise<void> {
  if (isTestEnv || !client) {
    return;
  }

  try {
    await withRedisTimeout(
      client.xGroupCreate(STREAM_NAME, consumerGroup, "0", {
        MKSTREAM: true,
      }),
      REDIS_COMMAND_TIMEOUT_MS,
      "xGroupCreate",
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("BUSYGROUP")) {
      return;
    }
    console.warn(
      `[ensureConsumerGroup] Could not ensure group ${consumerGroup} exists:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function xAddBulk(websites: WebsiteEvent[]) {
  if (isTestEnv) {
    return;
  }

  if (!client) {
    console.warn("Redis client not initialized, skipping xAddBulk");
    return;
  }

  const batchSize = 250;
  for (let i = 0; i < websites.length; i += batchSize) {
    const batch = websites.slice(i, i + batchSize);

    try {
      const multi = client.multi();
      for (const website of batch) {
        multi.xAdd(STREAM_NAME, "*", { url: website.url, id: website.id });
      }
      const res = await multi.exec();
      if (res === null) {
        console.warn("[xAddBulk] Redis disconnected, skipping batch");
        continue;
      }

      try {
        await withRedisTimeout(
          client.sendCommand(["XTRIM", STREAM_NAME, "MAXLEN", "~", "8000"]),
          REDIS_COMMAND_TIMEOUT_MS,
          "xTrim",
        );
      } catch (error) {
        console.warn("[xAddBulk] Failed to trim stream:", error);
      }
    } catch (error) {
      console.error("[xAddBulk] Error processing batch:", error);
    }
  }
}

export async function xReadGroup(
  options: ReadGroupOptions,
): Promise<MessageType[]> {
  if (isTestEnv) {
    return [];
  }

  if (!client) {
    console.warn("Redis client not initialized, returning empty messages");
    return [];
  }

  const operationKey = "xReadGroup";
  const failureState = redisFailureState.get(operationKey);

  if (failureState && failureState.failures > 0) {
    const backoffMs = Math.min(
      BASE_BACKOFF_MS * Math.pow(2, failureState.failures - 1),
      MAX_BACKOFF_MS,
    );
    const timeSinceLastFailure = Date.now() - failureState.lastFailureAt;
    if (timeSinceLastFailure < backoffMs) {
      return [];
    }
  }

  try {
    await ensureConsumerGroup(options.consumerGroup);

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
          BLOCK: 1000,
        },
      ),
      XREADGROUP_TIMEOUT_MS,
      "xReadGroup(BLOCK 1000)",
    )) as StreamReadResponse[];

    redisFailureState.set(operationKey, { failures: 0, lastFailureAt: 0 });

    if (!response || response.length === 0 || !response[0]?.messages) {
      return [];
    }

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
    const currentFailures = failureState?.failures ?? 0;
    redisFailureState.set(operationKey, {
      failures: currentFailures + 1,
      lastFailureAt: Date.now(),
    });

    console.error("Error reading from stream:", error);
    return [];
  }
}

const xAutoClaimCursors = new Map<string, string>();

const redisFailureState = new Map<
  string,
  { failures: number; lastFailureAt: number }
>();

const MAX_BACKOFF_MS = 5000;
const BASE_BACKOFF_MS = 100;

export async function xAutoClaimStale(
  options: AutoClaimOptions,
): Promise<MessageType[]> {
  if (isTestEnv) {
    return [];
  }

  if (!client) {
    console.warn("Redis client not initialized, returning empty messages");
    return [];
  }

  const operationKey = "xAutoClaimStale";
  const failureState = redisFailureState.get(operationKey);

  if (failureState && failureState.failures > 0) {
    const backoffMs = Math.min(
      BASE_BACKOFF_MS * Math.pow(2, failureState.failures - 1),
      MAX_BACKOFF_MS,
    );
    const timeSinceLastFailure = Date.now() - failureState.lastFailureAt;
    if (timeSinceLastFailure < backoffMs) {
      return [];
    }
  }

  try {
    await ensureConsumerGroup(options.consumerGroup);

    let startId = xAutoClaimCursors.get(options.consumerGroup) || "0-0";
    const allMessages: MessageType[] = [];
    const maxTotalReclaim = options.maxTotalReclaim ?? 200;

    while (allMessages.length < maxTotalReclaim) {
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

      if (!claimedMessages || claimedMessages.length === 0) {
        xAutoClaimCursors.set(options.consumerGroup, "0-0");
        break;
      }

      xAutoClaimCursors.set(options.consumerGroup, nextId);

      const malformedMessageIds: string[] = [];
      const validClaimedMessages: StreamMessage[] = [];

      for (const streamMessage of claimedMessages) {
        if (streamMessage.message.url && streamMessage.message.id) {
          validClaimedMessages.push(streamMessage);
        } else {
          malformedMessageIds.push(streamMessage.id);
          console.warn(
            `[xAutoClaimStale] Malformed message ${streamMessage.id}: missing url or id, will ACK to clear from PEL`,
          );
        }
      }

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
          console.error(
            `[xAutoClaimStale] Failed to ACK malformed messages:`,
            ackError,
          );
        }
      }

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

      if (claimedMessages.length < options.count) {
        xAutoClaimCursors.set(options.consumerGroup, nextId);
        break;
      }

      if (allMessages.length >= maxTotalReclaim) {
        xAutoClaimCursors.set(options.consumerGroup, nextId);
        break;
      }

      startId = nextId;
    }

    redisFailureState.set(operationKey, { failures: 0, lastFailureAt: 0 });

    return allMessages;
  } catch (error) {
    const currentFailures = failureState?.failures ?? 0;
    redisFailureState.set(operationKey, {
      failures: currentFailures + 1,
      lastFailureAt: Date.now(),
    });

    xAutoClaimCursors.set(options.consumerGroup, "0-0");
    console.error("Error auto-claiming stale messages:", error);
    return [];
  }
}

async function xAck(options: AckOptions): Promise<number> {
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
    console.error("Error acknowledging message:", error);
    return 0;
  }
}

export async function xAckBulk(options: AckBulkOptions) {
  if (isTestEnv) {
    return;
  }

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

export async function xPendingInfo(
  consumerGroup: string,
): Promise<PendingInfo> {
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
        const idleTimes = pendingEntries.map(([, , idleMs]) => idleMs);
        oldestIdleMs = Math.max(...idleTimes);
      }
    } catch (error) {
      console.warn(
        "[xPendingInfo] Failed to get detailed pending entries:",
        error,
      );
    }

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
  minIdleMs: number;
  maxCount?: number;
}

export async function xForceAckStalePel(
  options: ForceAckStalePelOptions,
): Promise<number> {
  if (isTestEnv) {
    return 0;
  }

  if (!client) {
    console.warn("Redis client not initialized, cannot force-ack stale PEL");
    return 0;
  }

  const maxCount = options.maxCount ?? 100;

  try {
    await ensureConsumerGroup(options.consumerGroup);

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

    const staleEntryIds: string[] = [];
    for (const [id, , idleMs] of pendingEntries) {
      if (idleMs >= options.minIdleMs) {
        staleEntryIds.push(id);
      }
    }

    if (staleEntryIds.length === 0) {
      return 0;
    }

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
    console.error("[xForceAckStalePel] Failed to force-ack stale PEL:", error);
    return 0;
  }
}
