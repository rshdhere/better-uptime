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
  await Promise.all(
    websites.map((website) => xAdd({ url: website.url, id: website.id })),
  );
}

export async function xReadGroup(
  options: ReadGroupOptions,
): Promise<MessageType[]> {
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
      },
    )) as StreamReadResponse[];

    if (!response || response.length === 0 || !response[0]?.messages) {
      console.log(
        `No messages found in stream for consumer group: ${options.consumerGroup}, worker: ${options.workerId}`,
      );
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
