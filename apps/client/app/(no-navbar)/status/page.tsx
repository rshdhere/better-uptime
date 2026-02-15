import { headers } from "next/headers";
import { PublicStatusOverview } from "@/components/status/PublicStatusOverview";

function normalizeHostname(rawHost: string | null): string {
  if (!rawHost) return "";
  const [firstHost] = rawHost.split(",");
  const host = firstHost?.trim().toLowerCase();
  if (!host) return "";
  return host.split(":")[0] || "";
}

export default async function StatusPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const hostFromQuery = resolvedSearchParams?.hostname;
  const hostnameFromQuery =
    typeof hostFromQuery === "string" ? hostFromQuery : "";

  const requestHeaders = await headers();
  const headerHost =
    requestHeaders.get("x-status-host") ||
    requestHeaders.get("x-forwarded-host") ||
    requestHeaders.get("host");

  const hostname = normalizeHostname(hostnameFromQuery || headerHost);

  return <PublicStatusOverview hostname={hostname} />;
}
