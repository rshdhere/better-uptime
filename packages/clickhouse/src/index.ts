import { createClient, type ClickHouseClient } from "@clickhouse/client";
import {
  CLICKHOUSE_URL,
  CLICKHOUSE_USERNAME,
  CLICKHOUSE_PASSWORD,
  CLICKHOUSE_DATABASE,
  CLICKHOUSE_METRICS_TABLE,
} from "@repo/config";

export type UptimeStatus = "UP" | "DOWN";

export interface UptimeEventRecord {
  websiteId: string;
  regionId: string;
  status: UptimeStatus;
  responseTimeMs?: number;
  httpStatusCode?: number;
  checkedAt: Date;
}

let client: ClickHouseClient | null = null;
let schemaReadyPromise: Promise<void> | null = null;
let schemaVerifiedAt: number | null = null;
const CLICKHOUSE_SCHEMA_TIMEOUT_MS = 10_000;
const CLICKHOUSE_QUERY_TIMEOUT_MS = 3_000;
const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;

function toClickHouseDateTime64(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", "");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  }) as Promise<T>;
}

function assertConfig() {
  if (!CLICKHOUSE_URL) {
    throw new Error(
      "CLICKHOUSE_URL is not set. Please configure your ClickHouse HTTP endpoint.",
    );
  }
}

function assertIdentifier(identifier: string) {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Invalid ClickHouse identifier: ${identifier}`);
  }
}

function getClient(): ClickHouseClient {
  if (!client) {
    assertConfig();

    client = createClient({
      url: CLICKHOUSE_URL,
      username: CLICKHOUSE_USERNAME || "default",
      password: CLICKHOUSE_PASSWORD,
      database: CLICKHOUSE_DATABASE || "default",
    });
  }

  return client;
}

async function ensureSchema(): Promise<void> {
  if (schemaVerifiedAt && Date.now() - schemaVerifiedAt > SCHEMA_CACHE_TTL_MS) {
    schemaReadyPromise = null;
  }

  if (schemaReadyPromise) {
    return schemaReadyPromise;
  }

  schemaReadyPromise = (async () => {
    assertIdentifier(CLICKHOUSE_METRICS_TABLE);

    const clickhouse = getClient();

    await withTimeout(
      clickhouse.command({
        query: `
          CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_METRICS_TABLE} (
            website_id String,
            region_id String,
            status Enum('UP' = 1, 'DOWN' = 0),
            response_time_ms Nullable(UInt32),
            http_status_code Nullable(UInt16),
            checked_at DateTime64(3, 'UTC'),
            ingested_at DateTime64(3, 'UTC')
          )
          ENGINE = MergeTree
          ORDER BY (website_id, region_id, checked_at)
        `,
      }),
      CLICKHOUSE_SCHEMA_TIMEOUT_MS,
      "ClickHouse CREATE TABLE",
    );

    await withTimeout(
      clickhouse.command({
        query: `
          ALTER TABLE ${CLICKHOUSE_METRICS_TABLE}
          ADD COLUMN IF NOT EXISTS http_status_code Nullable(UInt16)
        `,
      }),
      CLICKHOUSE_SCHEMA_TIMEOUT_MS,
      "ClickHouse ALTER TABLE",
    );

    schemaVerifiedAt = Date.now();
  })().catch((error) => {
    schemaReadyPromise = null;
    schemaVerifiedAt = null;
    throw error;
  });

  return schemaReadyPromise;
}

export async function recordUptimeEvent(
  event: UptimeEventRecord,
): Promise<void> {
  await ensureSchema();
  const clickhouse = getClient();

  await clickhouse.insert({
    table: CLICKHOUSE_METRICS_TABLE,
    values: [
      {
        website_id: event.websiteId,
        region_id: event.regionId,
        status: event.status,
        response_time_ms: event.responseTimeMs ?? null,
        http_status_code: event.httpStatusCode ?? null,
        checked_at: toClickHouseDateTime64(event.checkedAt),
        ingested_at: toClickHouseDateTime64(new Date()),
      },
    ],
    format: "JSONEachRow",
  });
}

const CLICKHOUSE_MAX_BATCH_SIZE = 1000;

export async function recordUptimeEvents(
  events: UptimeEventRecord[],
): Promise<void> {
  await ensureSchema();

  if (events.length === 0) return;
  const clickhouse = getClient();
  const ingestedAt = toClickHouseDateTime64(new Date());

  const INSERT_TIMEOUT_MS = 15_000;

  if (events.length <= CLICKHOUSE_MAX_BATCH_SIZE) {
    await withTimeout(
      clickhouse.insert({
        table: CLICKHOUSE_METRICS_TABLE,
        values: events.map((event) => ({
          website_id: event.websiteId,
          region_id: event.regionId,
          status: event.status,
          response_time_ms: event.responseTimeMs ?? null,
          http_status_code: event.httpStatusCode ?? null,
          checked_at: toClickHouseDateTime64(event.checkedAt),
          ingested_at: ingestedAt,
        })),
        format: "JSONEachRow",
      }),
      INSERT_TIMEOUT_MS,
      "ClickHouse insert",
    );
  } else {
    for (let i = 0; i < events.length; i += CLICKHOUSE_MAX_BATCH_SIZE) {
      const chunk = events.slice(i, i + CLICKHOUSE_MAX_BATCH_SIZE);
      await withTimeout(
        clickhouse.insert({
          table: CLICKHOUSE_METRICS_TABLE,
          values: chunk.map((event) => ({
            website_id: event.websiteId,
            region_id: event.regionId,
            status: event.status,
            response_time_ms: event.responseTimeMs ?? null,
            http_status_code: event.httpStatusCode ?? null,
            checked_at: toClickHouseDateTime64(event.checkedAt),
            ingested_at: ingestedAt,
          })),
          format: "JSONEachRow",
        }),
        INSERT_TIMEOUT_MS,
        "ClickHouse insert chunk",
      );
    }
  }
}

export function getClickhouseClient(): ClickHouseClient {
  return getClient();
}

export async function getRecentStatusEvents(
  websiteIds: string[],
  limit: number = 90,
): Promise<
  Array<{
    website_id: string;
    region_id: string;
    status: "UP" | "DOWN";
    checked_at: string;
    response_time_ms: number | null;
    http_status_code: number | null;
  }>
> {
  if (websiteIds.length === 0) {
    return [];
  }

  try {
    await withTimeout(
      ensureSchema(),
      CLICKHOUSE_SCHEMA_TIMEOUT_MS,
      "ClickHouse ensureSchema",
    );
  } catch {
    return [];
  }
  const clickhouse = getClient();

  const escapedIds = websiteIds
    .map((id) => `'${id.replace(/'/g, "''")}'`)
    .join(",");

  const query = `
    SELECT 
      website_id,
      region_id,
      status,
      checked_at,
      response_time_ms,
      http_status_code
    FROM ${CLICKHOUSE_METRICS_TABLE}
    WHERE website_id IN (${escapedIds})
    ORDER BY website_id, checked_at DESC
    LIMIT ${limit} BY website_id
  `;

  let result: Awaited<ReturnType<ClickHouseClient["query"]>>;
  try {
    result = await withTimeout(
      clickhouse.query({
        query,
        format: "JSONEachRow",
      }),
      CLICKHOUSE_QUERY_TIMEOUT_MS,
      "ClickHouse query",
    );
  } catch {
    return [];
  }

  const data = (await result.json()) as Array<{
    website_id: string;
    region_id: string;
    status: "UP" | "DOWN";
    checked_at: string;
    response_time_ms: number | null;
    http_status_code: number | null;
  }>;

  return data;
}
