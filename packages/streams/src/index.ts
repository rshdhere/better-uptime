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
}

// In test environment, skip Redis connection and use mocks
const isTestEnv = process.env.NODE_ENV === "test";

let client: ReturnType<typeof createClient> | null = null;

if (!isTestEnv) {
  const redisClient = createClient({
    username: REDIS_USERNAME,
    password: REDIS_PASSWORD,
    socket: {
      host: REDIS_HOST,
      port: Number(REDIS_PORT),
    },
  });

  redisClient.on("error", (err) => {
    console.error("Redis Client Error", err);
    process.exit(1);
  });

  try {
    client = await redisClient.connect();
  } catch (error) {
    console.error("Failed to connect to Redis:", error);
    process.exit(1);
  }
}

export async function xAddBulk(websites: WebsiteEvent[]) {
  // Mock in test environment
  if (isTestEnv) {
    return;
  }

  if (!client) {
    throw new Error("Redis client not initialized");
  }

  // Avoid unbounded Promise.all fan-out (can freeze machines with large website counts).
  // Use Redis pipelining in bounded batches.
  const batchSize = 250;
  for (let i = 0; i < websites.length; i += batchSize) {
    const batch = websites.slice(i, i + batchSize);
    const multi = client.multi();
    for (const website of batch) {
      multi.xAdd(STREAM_NAME, "*", { url: website.url, id: website.id });
    }
    const res = await multi.exec();
    // node-redis returns null if disconnected; surface as error
    if (res === null) {
      throw new Error("Redis MULTI exec returned null (disconnected?)");
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
    throw new Error("Redis client not initialized");
  }

  try {
    const response = (await client.xReadGroup(
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
    )) as StreamReadResponse[];

    if (!response || response.length === 0 || !response[0]?.messages) {
      return [];
    }

    const messages: MessageType[] = response[0].messages
      .filter(
        (streamMessage: StreamMessage) =>
          streamMessage.message.url && streamMessage.message.id,
      )
      .map((streamMessage: StreamMessage) => ({
        id: streamMessage.id,
        event: {
          url: streamMessage.message.url as string,
          id: streamMessage.message.id as string,
        },
      }));

    return messages;
  } catch (error) {
    console.error("Error reading from stream:", error);
    return [];
  }
}

// Use XAUTOCLAIM to take over *stale* pending messages from ANY consumer in
// the group and assign them to the current worker. This is the robust way to
// recover messages that were delivered to a dead consumer and never acked.
export async function xAutoClaimStale(
  options: AutoClaimOptions,
): Promise<MessageType[]> {
  // Mock in test environment
  if (isTestEnv) {
    return [];
  }

  if (!client) {
    throw new Error("Redis client not initialized");
  }

  try {
    // node-redis XAUTOCLAIM returns: [messages, nextStartId]
    const result = (await client.xAutoClaim(
      STREAM_NAME,
      options.consumerGroup,
      options.workerId,
      options.minIdleMs,
      "0-0",
      {
        COUNT: options.count,
      },
    )) as unknown as { messages: StreamMessage[]; nextId: string };

    const claimedMessages = result?.messages ?? null;

    if (!claimedMessages || claimedMessages.length === 0) {
      return [];
    }

    const messages: MessageType[] = claimedMessages
      .filter(
        (streamMessage: StreamMessage) =>
          streamMessage.message.url && streamMessage.message.id,
      )
      .map((streamMessage: StreamMessage) => ({
        id: streamMessage.id,
        event: {
          url: streamMessage.message.url as string,
          id: streamMessage.message.id as string,
        },
      }));

    return messages;
  } catch (error) {
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
    throw new Error("Redis client not initialized");
  }

  try {
    const result = await client.xAck(
      STREAM_NAME,
      options.consumerGroup,
      options.streamId,
    );
    return result;
  } catch (error) {
    console.error("Error acknowledging message:", error);
    throw error;
  }
}

export async function xAckBulk(options: AckBulkOptions) {
  // Mock in test environment
  if (isTestEnv) {
    return;
  }

  await Promise.all(
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
    throw new Error("Redis client not initialized");
  }

  try {
    // Get summary (pending count, first/last IDs, consumers)
    const summary = (await client.xPending(
      STREAM_NAME,
      consumerGroup,
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
      const pendingEntries = (await client.sendCommand([
        "XPENDING",
        STREAM_NAME,
        consumerGroup,
        "-",
        "+",
        "100",
      ])) as Array<[string, string, number, number]> | null;

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
    console.error("Error checking PEL status:", error);
    throw error;
  }
}
