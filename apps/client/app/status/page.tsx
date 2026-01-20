"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Tracker, type TrackerBlockProps } from "@/components/Tracker";

function getErrorMessage(error: { message: string }): string {
  try {
    const parsed = JSON.parse(error.message);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].message) {
      return parsed[0].message;
    }
  } catch {
    // Not JSON, return as-is
  }
  return error.message;
}

export default function StatusPage() {
  const router = useRouter();

  const [token] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token");
  });

  useEffect(() => {
    if (!token) {
      router.replace("/login");
    }
  }, [router, token]);

  const statusQuery = trpc.website.status.useQuery(undefined, {
    enabled: !!token,
    retry: false,
    // Keep data fresh without requiring hard refreshes.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    gcTime: 60_000,
  });

  useEffect(() => {
    if (statusQuery.error) {
      toast.error("Failed to load status", {
        description: getErrorMessage(statusQuery.error),
      });
    }
  }, [statusQuery.error]);

  const buildStatusBadge = (
    currentStatus:
      | {
          status: "UP" | "DOWN";
          checkedAt: Date | string;
          responseTimeMs: number | null;
          regionId: string;
        }
      | null
      | undefined,
  ) => {
    if (!currentStatus) {
      return {
        label: "Unknown",
        className: "bg-muted text-muted-foreground",
        tooltip: "No checks recorded yet",
      };
    }

    const checkedAtDate = new Date(currentStatus.checkedAt);
    const formattedTime = checkedAtDate.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    if (currentStatus.status === "UP") {
      return {
        label: "Up",
        className: "bg-primary/10 text-primary",
        tooltip: `Up since ${formattedTime}${
          currentStatus.responseTimeMs
            ? ` • ${currentStatus.responseTimeMs}ms`
            : ""
        }`,
      };
    }

    return {
      label: "Down",
      className: "bg-destructive/10 text-destructive",
      tooltip: `Down since ${formattedTime}`,
    };
  };

  // Convert status points to tracker data - memoized to avoid recalculating on every render
  const getTrackerData = (
    statusPoints: Array<{
      status: "UP" | "DOWN";
      checkedAt: Date | string;
      responseTimeMs: number | null;
    }>,
  ): TrackerBlockProps[] => {
    const SLOT_COUNT = 30;
    // Keep the latest N points, then sort ascending (oldest -> newest)
    const latestPoints = statusPoints
      .slice()
      .sort(
        (a, b) =>
          new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime(),
      )
      .slice(-SLOT_COUNT);

    const sorted = [...latestPoints].sort(
      (a, b) =>
        new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime(),
    );
    const result: TrackerBlockProps[] = sorted.map((point, index) => {
      const isUp = point.status === "UP";
      const color = isUp
        ? "bg-indigo-600 dark:bg-indigo-500"
        : "bg-destructive";

      const date = new Date(point.checkedAt);
      const windowStart = new Date(date.getTime() - 2 * 60 * 1000);
      const fromTime = windowStart.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      });
      const toTime = date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      });
      const dateStr = date.toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
        timeZone: "Asia/Kolkata",
      });

      const tooltipParts = [
        point.status === "UP" ? "UP" : "DOWN",
        `${dateStr} ${fromTime} – ${toTime}`,
      ];
      if (point.responseTimeMs !== null) {
        tooltipParts.push(`${point.responseTimeMs}ms`);
      }
      const tooltip = tooltipParts.join(" • ");

      return {
        key: index,
        color,
        tooltip,
        hoverEffect: true,
        hoverCardClassName: isUp
          ? "border-indigo-600/30 bg-indigo-600/10 text-indigo-600 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
          : "border-destructive/20 bg-destructive/10 text-destructive",
      };
    });

    // Always render a 30-slot strip; colored ticks start at the left and grow rightward.
    if (result.length < SLOT_COUNT) {
      const placeholders = Array.from(
        { length: SLOT_COUNT - result.length },
        (_, index) => ({
          key: `placeholder-${index}`,
          tooltip: "No checks yet",
          hoverEffect: false,
        }),
      ) satisfies TrackerBlockProps[];
      return [...result, ...placeholders];
    }

    return result;
  };

  // Memoize processed websites data to avoid recalculating on every render
  const processedWebsites = useMemo(() => {
    if (!statusQuery.data?.websites) return [];
    return statusQuery.data.websites.map((website) => {
      const websiteTrackerData = getTrackerData(website.statusPoints);
      const hasData = websiteTrackerData.length > 0;

      return {
        website,
        trackerData: websiteTrackerData,
        hasData,
        badge: buildStatusBadge(website.currentStatus),
      };
    });
  }, [statusQuery.data]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-28 pb-16">
      {!token ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground">
          <div className="text-sm text-muted-foreground">
            Redirecting to{" "}
            <Link href="/login" className="underline underline-offset-4">
              login
            </Link>
            …
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Website Status
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor the uptime status of your websites.
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card text-card-foreground">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Status Overview</h2>
        </div>

        <div className="px-6 py-4">
          {!token ? null : statusQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : statusQuery.isError ? (
            <p className="text-sm text-muted-foreground">
              Couldn’t load status right now.{" "}
              <Link href="/dashboard" className="underline underline-offset-4">
                Go back to dashboard
              </Link>
              .
            </p>
          ) : !statusQuery.data?.websites?.length ? (
            <p className="text-sm text-muted-foreground">
              No websites found.{" "}
              <Link href="/dashboard" className="underline underline-offset-4">
                Add your first website
              </Link>
              .
            </p>
          ) : processedWebsites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No status data available yet. Checks will appear here once
              monitoring begins.
            </p>
          ) : (
            <div className="space-y-8">
              {processedWebsites.map(
                ({ website, trackerData, hasData, badge }) => (
                  <div key={website.websiteId} className="space-y-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {website.websiteName || website.websiteUrl}
                        </div>
                        <a
                          href={website.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-sm text-muted-foreground underline underline-offset-4"
                        >
                          {website.websiteUrl}
                        </a>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${badge.className}`}
                          title={badge.tooltip}
                        >
                          <span className="inline-block size-2 rounded-full bg-current" />
                          <span>{badge.label}</span>
                        </div>
                        {hasData && (
                          <div className="text-sm text-muted-foreground">
                            {website.statusPoints.length} checks
                          </div>
                        )}
                      </div>
                    </div>
                    <Tracker data={trackerData} hoverEffect={hasData} />
                    {!hasData ? (
                      <div className="text-sm text-muted-foreground">
                        No status data available yet. Checks will appear here
                        once monitoring begins.
                      </div>
                    ) : null}
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
