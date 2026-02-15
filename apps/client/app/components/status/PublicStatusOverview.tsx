"use client";

import Link from "next/link";
import { AlertCircle, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Tracker, type TrackerBlockProps } from "@/components/Tracker";

interface PublicStatusOverviewProps {
  hostname: string;
}

function getErrorMessage(error: { message: string }): string {
  try {
    const parsed = JSON.parse(error.message);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].message) {
      return parsed[0].message;
    }
  } catch {
    // Keep original message when payload is not JSON.
  }
  return error.message;
}

function formatStatusTime(checkedAt: Date | string) {
  const date = new Date(checkedAt);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildTrackerData(
  statusPoints: Array<{
    status: "UP" | "DOWN";
    checkedAt: Date | string;
    responseTimeMs: number | null;
  }>,
): TrackerBlockProps[] {
  const SLOT_COUNT = 30;

  const points = statusPoints.slice(0, SLOT_COUNT).reverse();
  const pointBlocks: TrackerBlockProps[] = points.map((point, index) => {
    const checkedAt = formatStatusTime(point.checkedAt);
    const tooltipParts = [point.status, checkedAt];
    if (point.responseTimeMs !== null) {
      tooltipParts.push(`${point.responseTimeMs}ms`);
    }

    return {
      key: `public-point-${index}-${point.checkedAt}`,
      color: point.status === "UP" ? "bg-primary-action" : "bg-destructive",
      tooltip: tooltipParts.join(" • "),
      hoverEffect: true,
    };
  });

  const emptyBlocksCount = SLOT_COUNT - pointBlocks.length;
  const emptyBlocks = Array.from({ length: emptyBlocksCount }, (_, index) => ({
    key: `public-empty-${index}`,
    tooltip: "No check in this interval",
    hoverEffect: false,
  }));

  return [...emptyBlocks, ...pointBlocks];
}

function renderStatusBadge(
  currentStatus: {
    status: "UP" | "DOWN";
    checkedAt: Date | string;
    responseTimeMs: number | null;
  } | null,
) {
  if (!currentStatus) {
    return (
      <div className="rounded-full border border-border bg-muted px-3 py-1 text-sm text-muted-foreground">
        Unknown
      </div>
    );
  }

  const label = currentStatus.status === "UP" ? "Up" : "Down";
  const className =
    currentStatus.status === "UP"
      ? "border border-primary-action/30 bg-primary-action/10 text-primary-action"
      : "border border-destructive/30 bg-destructive/10 text-destructive";

  return (
    <div
      className={`rounded-full px-3 py-1 text-sm font-medium ${className}`}
      title={`Last check: ${formatStatusTime(currentStatus.checkedAt)}`}
    >
      {label}
    </div>
  );
}

export function PublicStatusOverview({ hostname }: PublicStatusOverviewProps) {
  const statusQuery = trpc.statusPage.publicByHost.useQuery(
    {
      hostname,
      viewMode: "per-check",
    },
    {
      enabled: Boolean(hostname),
      retry: false,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  );

  if (!hostname) {
    return (
      <div className="mx-auto mt-24 max-w-3xl rounded-xl border border-border bg-card p-6 text-card-foreground">
        Missing hostname. Open this page from your configured status subdomain.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-20">
      {statusQuery.isLoading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
          Loading public status page...
        </div>
      ) : statusQuery.isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-destructive">
          <div className="flex items-center gap-2 text-base font-medium">
            <AlertCircle className="size-4" />
            Unable to load status page
          </div>
          <p className="mt-2 text-sm">
            {getErrorMessage(statusQuery.error) ||
              "This status page is unavailable."}
          </p>
        </div>
      ) : !statusQuery.data ? (
        <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
          Status page not found.
        </div>
      ) : (
        <>
          <div className="mb-8 rounded-2xl border border-border bg-card p-6 text-card-foreground">
            <h1 className="text-3xl font-bold tracking-tight">
              {statusQuery.data.statusPage.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Live status for <span className="font-medium">{hostname}</span>
            </p>
          </div>

          <div className="space-y-6">
            {statusQuery.data.statusPage.websites.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                No monitors are currently attached to this status page.
              </div>
            ) : (
              statusQuery.data.statusPage.websites.map((website) => (
                <div
                  key={website.websiteId}
                  className="rounded-xl border border-border bg-card p-5 text-card-foreground"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-semibold">
                        {website.websiteName || website.websiteUrl}
                      </div>
                      <a
                        href={website.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground underline underline-offset-4"
                      >
                        {website.websiteUrl}
                        <ExternalLink className="size-3" />
                      </a>
                    </div>
                    {renderStatusBadge(website.currentStatus)}
                  </div>

                  <div className="mt-4 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Last 30 checks
                    </p>
                    <Tracker
                      data={buildTrackerData(website.statusPoints)}
                      hoverEffect={website.statusPoints.length > 0}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-10 text-center text-sm text-muted-foreground">
            Powered by{" "}
            <Link href="/" className="underline underline-offset-4">
              Uptique
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
