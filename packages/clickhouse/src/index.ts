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

const CLICKHOUSE_SCHEMA_TIMEOUT_MS = 10_000;
// Cap query wait so the status API never feels sluggish
const CLICKHOUSE_QUERY_TIMEOUT_MS = 3_000;

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
  if (schemaReadyPromise) {
    return schemaReadyPromise;
  }

  schemaReadyPromise = (async () => {
    assertIdentifier(CLICKHOUSE_METRICS_TABLE);

    const clickhouse = getClient();

    await clickhouse.command({
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
    });

    // Add column if table already exists (for migration)
    await clickhouse.command({
      query: `
        ALTER TABLE ${CLICKHOUSE_METRICS_TABLE}
        ADD COLUMN IF NOT EXISTS http_status_code Nullable(UInt16)
      `,
    });
  })();

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
        checked_at: event.checkedAt.toISOString(),
        ingested_at: new Date().toISOString(),
      },
    ],
    format: "JSONEachRow",
  });
}

export async function recordUptimeEvents(
  events: UptimeEventRecord[],
): Promise<void> {
  if (events.length === 0) return;

  await ensureSchema();
  const clickhouse = getClient();
  const ingestedAtIso = new Date().toISOString();

  await clickhouse.insert({
    table: CLICKHOUSE_METRICS_TABLE,
    values: events.map((event) => ({
      website_id: event.websiteId,
      region_id: event.regionId,
      status: event.status,
      response_time_ms: event.responseTimeMs ?? null,
      http_status_code: event.httpStatusCode ?? null,
      checked_at: event.checkedAt.toISOString(),
      ingested_at: ingestedAtIso,
    })),
    format: "JSONEachRow",
  });
}

export function getClickhouseClient(): ClickHouseClient {
  return getClient();
}

/**
 * Query recent status events for a list of website IDs
 * Returns the most recent status checks (up to limit per website)
 */
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
    // Keep this bounded so a down ClickHouse doesn't hang the API.
    await withTimeout(
      ensureSchema(),
      CLICKHOUSE_SCHEMA_TIMEOUT_MS,
      "ClickHouse ensureSchema",
    );
  } catch {
    return [];
  }
  const clickhouse = getClient();

  // Escape website IDs for SQL injection safety
  const escapedIds = websiteIds
    .map((id) => `'${id.replace(/'/g, "''")}'`)
    .join(",");

  // Use LIMIT BY to get the most recent events per website
  // ClickHouse LIMIT BY allows us to get N rows per group efficiently
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
