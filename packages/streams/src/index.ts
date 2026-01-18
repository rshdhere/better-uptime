import { createClient } from "redis";
import {
  REDIS_USERNAME,
  REDIS_PASSWORD,
  REDIS_HOST,
  REDIS_PORT,
} from "@repo/config";

interface WebsiteEvent {
  url: string;
  id: string;
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
  await client.xAdd("betteruptime:website", "*", {
    url,
    id,
  });
}

export async function xAddBulk(websites: WebsiteEvent[]) {
  websites.forEach(async (website) => {
    await xAdd({ url: website.url, id: website.id });
  });
}
