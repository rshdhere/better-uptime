import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from the config package root
const envPath = join(__dirname, "..", ".env");

// Use Bun to load the .env file
// Only use Bun loader if running in Bun runtime
if (typeof Bun !== "undefined") {
  const envFile = Bun.file(envPath);
  const envExists = await envFile.exists();

  if (envExists) {
    const envContent = await envFile.text();

    // Parse and set environment variables
    for (const line of envContent.split("\n")) {
      const trimmedLine = line.trim();

      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith("#")) continue;

      const equalIndex = trimmedLine.indexOf("=");
      if (equalIndex === -1) continue;

      const key = trimmedLine.slice(0, equalIndex).trim();
      let value = trimmedLine.slice(equalIndex + 1).trim();

      // Remove surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // Only set if not already defined (allows runtime override)
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

// Export typed environment variables
function getEnvVar(key: string, required: boolean = true): string {
  const value = process.env[key];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || "";
}

// Database
export const DATABASE_URL = getEnvVar("DATABASE_URL");

// Auth
export const JWT_SECRET = getEnvVar("JWT_SECRET");

// GitHub OAuth
export const GITHUB_CLIENT_ID = getEnvVar("CLIENT_ID_GITHUB");
export const GITHUB_CLIENT_SECRET = getEnvVar("CLIENT_SECRET_GITHUB");

// Resend (Email)
export const RESEND_API_KEY = getEnvVar("RESEND_API_KEY");

// Redis (optional - only required when using Redis features)
export const REDIS_USERNAME = getEnvVar("REDIS_USERNAME", false) || "default";
export const REDIS_PASSWORD = getEnvVar("REDIS_PASSWORD", false) || "";
export const REDIS_HOST = getEnvVar("REDIS_HOST", false) || "localhost";
export const REDIS_PORT = getEnvVar("REDIS_PORT", false) || "6379";

// ClickHouse (optional - only required when using ClickHouse features)
export const CLICKHOUSE_URL = getEnvVar("CLICKHOUSE_URL", false) || "";
export const CLICKHOUSE_USERNAME =
  getEnvVar("CLICKHOUSE_USERNAME", false) || "default";
export const CLICKHOUSE_PASSWORD =
  getEnvVar("CLICKHOUSE_PASSWORD", false) || "";
export const CLICKHOUSE_DATABASE =
  getEnvVar("CLICKHOUSE_DATABASE", false) || "default";
export const CLICKHOUSE_METRICS_TABLE =
  getEnvVar("CLICKHOUSE_METRICS_TABLE", false) || "uptime_checks";

// Server
import { BACKEND_PORT as DEFAULT_BACKEND_PORT } from "./constants";
export const BACKEND_PORT =
  getEnvVar("BACKEND_PORT", false) || String(DEFAULT_BACKEND_PORT);

// Worker (optional - only required when using worker features)
export const REGION_ID = getEnvVar("REGION_ID", false) || "";
export const WORKER_ID = getEnvVar("WORKER_ID", false) || "";

// Streams
export const STREAM_NAME = "betteruptime:website";

// Export all env vars as a single object for convenience
export const env = {
  DATABASE_URL,
  JWT_SECRET,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  BACKEND_PORT,
  RESEND_API_KEY,
  REDIS_USERNAME,
  REDIS_PASSWORD,
  REDIS_HOST,
  REDIS_PORT,
  REGION_ID,
  WORKER_ID,
  STREAM_NAME,
  CLICKHOUSE_URL,
  CLICKHOUSE_USERNAME,
  CLICKHOUSE_PASSWORD,
  CLICKHOUSE_DATABASE,
  CLICKHOUSE_METRICS_TABLE,
} as const;
