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

let client: typeof redisClient;

try {
  client = await redisClient.connect();
} catch (error) {
  console.error("Failed to connect to Redis:", error);
  process.exit(1);
}

async function xAdd({ url, id }: WebsiteEvent) {
  await client.xAdd(STREAM_NAME, "*", {
    url,
    id,
  });
}

export async function xAddBulk(websites: WebsiteEvent[]) {
  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "run1",
      hypothesisId: "E",
      location: "packages/streams/src/index.ts:xAddBulk:entry",
      message: "xAddBulk called",
      data: {
        streamName: STREAM_NAME,
        websiteCount: websites.length,
        websiteIds: websites.slice(0, 50).map((w) => w.id),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

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
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "E",
        location: "packages/streams/src/index.ts:xAddBulk:batchDone",
        message: "xAddBulk batch published",
        data: {
          streamName: STREAM_NAME,
          batchIndex: i,
          batchSize: batch.length,
          resIsNull: res === null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }
}

export async function xReadGroup(
  options: ReadGroupOptions,
): Promise<MessageType[]> {
  try {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "A,B,C,E",
        location: "packages/streams/src/index.ts:xReadGroup:entry",
        message: "xReadGroup called",
        data: {
          streamName: STREAM_NAME,
          consumerGroup: options.consumerGroup,
          workerId: options.workerId,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

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

    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "A,C,D",
        location: "packages/streams/src/index.ts:xReadGroup:afterRead",
        message: "xReadGroup returned",
        data: {
          streamName: STREAM_NAME,
          responseExists: !!response,
          responseLength: response?.length,
          firstStreamMessages: response?.[0]?.messages?.length,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (!response || response.length === 0 || !response[0]?.messages) {
      // #region agent log
      fetch(
        "http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "run1",
            hypothesisId: "A,C",
            location: "packages/streams/src/index.ts:xReadGroup:empty",
            message: "xReadGroup empty response",
            data: { streamName: STREAM_NAME, responseType: typeof response },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      // #endregion
      return [];
    }

    const rawMessages = response[0].messages;
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

    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "D",
        location: "packages/streams/src/index.ts:xReadGroup:processed",
        message: "xReadGroup processed messages",
        data: {
          streamName: STREAM_NAME,
          rawCount: rawMessages.length,
          filteredCount: messages.length,
          filteredOut: rawMessages.length - messages.length,
          messageIds: messages.map((m) => m.event.id),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return messages;
  } catch (error) {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "B,C",
        location: "packages/streams/src/index.ts:xReadGroup:error",
        message: "xReadGroup threw",
        data: {
          streamName: STREAM_NAME,
          errorName: (error as Error)?.name,
          errorMessage: (error as Error)?.message,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    console.error("Error reading from stream:", error);
    return [];
  }
}

// Read *pending* (already-delivered but unacked) messages for a specific
// consumer in a group. Note: in Redis, pending messages are *owned* by the
// consumer that first saw them. If that consumer is gone, we must use
// XAUTOCLAIM instead (see xAutoClaimStale below).
export async function xReadGroupPending(
  options: ReadGroupOptions,
): Promise<MessageType[]> {
  try {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "A",
        location: "packages/streams/src/index.ts:xReadGroupPending:entry",
        message: "xReadGroupPending called",
        data: {
          streamName: STREAM_NAME,
          consumerGroup: options.consumerGroup,
          workerId: options.workerId,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const response = (await client.xReadGroup(
      options.consumerGroup,
      options.workerId,
      {
        key: STREAM_NAME,
        // "0" means: start from the beginning of the pending entries list
        // (already-delivered but unacked messages).
        id: "0",
      },
      {
        COUNT: 50,
        BLOCK: 0,
      },
    )) as StreamReadResponse[] | null;

    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "A",
        location: "packages/streams/src/index.ts:xReadGroupPending:afterRead",
        message: "xReadGroupPending returned",
        data: {
          streamName: STREAM_NAME,
          responseExists: !!response,
          responseLength: response?.length ?? 0,
          firstStreamMessages: response?.[0]?.messages?.length ?? 0,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (!response || response.length === 0 || !response[0]?.messages) {
      return [];
    }

    const rawMessages = response[0].messages;
    const messages: MessageType[] = rawMessages
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

    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "A",
        location: "packages/streams/src/index.ts:xReadGroupPending:processed",
        message: "xReadGroupPending processed messages",
        data: {
          streamName: STREAM_NAME,
          rawCount: rawMessages.length,
          filteredCount: messages.length,
          filteredOut: rawMessages.length - messages.length,
          messageIds: messages.map((m) => m.event.id),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return messages;
  } catch (error) {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "A",
        location: "packages/streams/src/index.ts:xReadGroupPending:error",
        message: "xReadGroupPending threw",
        data: {
          streamName: STREAM_NAME,
          errorName: (error as Error)?.name,
          errorMessage: (error as Error)?.message,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    console.error("Error reading pending from stream:", error);
    return [];
  }
}

// Use XAUTOCLAIM to take over *stale* pending messages from ANY consumer in
// the group and assign them to the current worker. This is the robust way to
// recover messages that were delivered to a dead consumer and never acked.
export async function xAutoClaimStale(
  options: AutoClaimOptions,
): Promise<MessageType[]> {
  try {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "A",
        location: "packages/streams/src/index.ts:xAutoClaimStale:entry",
        message: "xAutoClaimStale called",
        data: {
          streamName: STREAM_NAME,
          consumerGroup: options.consumerGroup,
          workerId: options.workerId,
          minIdleMs: options.minIdleMs,
          count: options.count,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

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

    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "A",
        location: "packages/streams/src/index.ts:xAutoClaimStale:afterClaim",
        message: "xAutoClaimStale result",
        data: {
          streamName: STREAM_NAME,
          hasResult: !!result,
          claimedCount: claimedMessages ? claimedMessages.length : 0,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

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

    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "A",
        location: "packages/streams/src/index.ts:xAutoClaimStale:processed",
        message: "xAutoClaimStale processed messages",
        data: {
          streamName: STREAM_NAME,
          claimedCount: claimedMessages.length,
          filteredCount: messages.length,
          filteredOut: claimedMessages.length - messages.length,
          messageIds: messages.map((m) => m.event.id),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return messages;
  } catch (error) {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "A",
        location: "packages/streams/src/index.ts:xAutoClaimStale:error",
        message: "xAutoClaimStale threw",
        data: {
          streamName: STREAM_NAME,
          errorName: (error as Error)?.name,
          errorMessage: (error as Error)?.message,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    console.error("Error auto-claiming stale messages:", error);
    return [];
  }
}

async function xAck(options: AckOptions): Promise<number> {
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
  await Promise.all(
    options.eventIds.map((eventId) =>
      xAck({ consumerGroup: options.consumerGroup, streamId: eventId }),
    ),
  );
}

// #region agent log - diagnostic function
export async function xPendingDiagnostic(consumerGroup: string): Promise<void> {
  try {
    // Get pending summary for the consumer group
    const pendingSummary = await client.xPending(STREAM_NAME, consumerGroup);
    // Get stream length
    const streamLen = await client.xLen(STREAM_NAME);
    // Get stream info
    const streamInfo = (await client.xInfoStream(STREAM_NAME)) as unknown as {
      length: number;
      "radix-tree-keys": number;
      "radix-tree-nodes": number;
      "last-generated-id": string;
      "entries-added": number;
      groups: number;
      "first-entry": { id: string } | null;
      "last-entry": { id: string } | null;
    };

    fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "A,B",
        location: "packages/streams/src/index.ts:xPendingDiagnostic",
        message: "Stream diagnostics",
        data: {
          streamName: STREAM_NAME,
          consumerGroup,
          streamLength: streamLen,
          pendingSummary: String(JSON.stringify(pendingSummary)).slice(0, 800),
          firstEntry: streamInfo?.["first-entry"]?.id ?? null,
          lastEntry: streamInfo?.["last-entry"]?.id ?? null,
          groups: streamInfo?.groups,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch (error) {
    fetch("http://127.0.0.1:7243/ingest/4d066341-b328-4de4-954f-033a4efeb773", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "A,B,C",
        location: "packages/streams/src/index.ts:xPendingDiagnostic:error",
        message: "Stream diagnostics error",
        data: {
          streamName: STREAM_NAME,
          consumerGroup,
          errorName: (error as Error)?.name,
          errorMessage: (error as Error)?.message,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
}
// #endregion
