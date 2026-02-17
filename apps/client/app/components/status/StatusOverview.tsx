"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Home } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Tracker, type TrackerBlockProps } from "@/components/Tracker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cx } from "@/lib/utils";

// Tracker configuration - single source of truth
// Changing CHECK_INTERVAL_MINUTES automatically adjusts all calculations
const TRACKER_CONFIG = {
  CHECK_INTERVAL_MINUTES: 3,
  SLOT_COUNT: 30,
  get WINDOW_MINUTES() {
    return this.CHECK_INTERVAL_MINUTES * this.SLOT_COUNT; // 90 minutes
  },
  // Daily view configuration
  DAY_WINDOW_COUNT: 30, // Show last 30 days
  TIMEZONE: "Asia/Kolkata", // Timezone for date calculations
} as const;

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

type ViewMode = "per-check" | "per-day";

interface StatusOverviewProps {
  embedded?: boolean;
}

export function StatusOverview({ embedded = false }: StatusOverviewProps) {
  const router = useRouter();

  const [token] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token");
  });

  const [viewMode, setViewMode] = useState<ViewMode>("per-check");

  useEffect(() => {
    if (!token) {
      router.replace("/login");
    }
  }, [router, token]);

  const statusQuery = trpc.website.status.useQuery(
    { viewMode },
    {
      enabled: !!token,
      retry: false,
      // Keep data fresh without requiring hard refreshes.
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: 0,
      gcTime: 60_000,
    },
  );

  useEffect(() => {
    // Never toast error for empty data - these are NOT errors:
    // - No websites
    // - No statusPoints yet (cold start user)
    // - Empty data is valid state
    if (statusQuery.error && statusQuery.data === undefined) {
      // Only show error if we don't have any data (not just empty array)
      const errorMessage = getErrorMessage(statusQuery.error);
      // Don't show error for UNAUTHORIZED - it's handled by trpc client
      if (!errorMessage.toLowerCase().includes("unauthorized")) {
        toast.error("Failed to load status", {
          description: errorMessage,
        });
      }
    }
  }, [statusQuery.error, statusQuery.data]);

  const buildStatusBadge = (
    currentStatus:
      | {
          status: "UP" | "DOWN";
          checkedAt: Date | string;
          responseTimeMs: number | null;
          httpStatusCode: number | null;
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
        isUp: false,
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
        className:
          "rounded-full border border-gray-200 py-1 pl-1 pr-2 dark:border-gray-800",
        tooltip: `Up since ${formattedTime}${
          currentStatus.responseTimeMs
            ? ` • ${currentStatus.responseTimeMs}ms`
            : ""
        }`,
        isUp: true, // Flag to indicate this needs special rendering with green dot
      };
    }

    return {
      label: "Down",
      className: "bg-destructive/10 text-destructive",
      tooltip: `Down since ${formattedTime}`,
      isUp: false,
    };
  };

  // TIME-BUCKETED RENDERING: Use explicit time buckets to ensure stable, deterministic display.
  // Each bucket represents one check interval. This makes gaps explicit and prevents visual jitter
  // when data refetches, as bucket boundaries are based on timestamps, not array positions.
  const getTrackerData = (
    statusPoints: Array<{
      status: "UP" | "DOWN";
      checkedAt: Date | string;
      responseTimeMs: number | null;
    }>,
  ): { trackerData: TrackerBlockProps[]; checksInWindow: number } => {
    const { CHECK_INTERVAL_MINUTES, SLOT_COUNT, WINDOW_MINUTES } =
      TRACKER_CONFIG;
    const INTERVAL_MS = CHECK_INTERVAL_MINUTES * 60 * 1000;

    // Helper: Format timestamp for tooltip display
    const formatTime = (timestamp: number) => {
      const date = new Date(timestamp);
      const timeStr = date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      });
      const dateStr = date.toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
        timeZone: "Asia/Kolkata",
      });
      return { timeStr, dateStr };
    };

    // Helper: Round timestamp down to nearest interval boundary
    // This ensures deterministic bucket boundaries across refetches
    const roundDownToInterval = (timestamp: number): number => {
      return Math.floor(timestamp / INTERVAL_MS) * INTERVAL_MS;
    };

    // Early return if no status points - return all empty buckets
    // Note: Without data, we can't determine bucket times, so show generic placeholders
    if (statusPoints.length === 0) {
      const trackerData = Array.from(
        { length: SLOT_COUNT },
        (_: unknown, bucketIndex: number) => {
          return {
            key: `bucket-empty-${bucketIndex}`,
            tooltip: "No check in this interval",
            hoverEffect: false,
          } satisfies TrackerBlockProps;
        },
      );
      return { trackerData, checksInWindow: 0 };
    }

    // Find the most recent check and use it to anchor bucket boundaries
    // This ensures buckets align with actual check times, not arbitrary client time
    const mostRecentTime = Math.max(
      ...statusPoints.map((point) => new Date(point.checkedAt).getTime()),
    );

    // Round down to nearest interval boundary to create stable bucket alignment
    // Bucket 0 (most recent) ends at this rounded time
    const bucket0End = roundDownToInterval(mostRecentTime) + INTERVAL_MS;

    // Create time buckets: each bucket represents one check interval
    // Buckets are ordered from oldest (left) to newest (right)
    const buckets: Array<{
      start: number;
      end: number;
      check: (typeof statusPoints)[number] | null;
    }> = [];

    for (let i = 0; i < SLOT_COUNT; i++) {
      const bucketEnd = bucket0End - i * INTERVAL_MS;
      const bucketStart = bucketEnd - INTERVAL_MS;
      buckets.push({ start: bucketStart, end: bucketEnd, check: null });
    }

    // Reverse to get oldest → newest order (left → right in UI)
    buckets.reverse();

    // Assign checks to buckets based on timestamp
    // A check belongs to the bucket whose time range contains its timestamp
    for (const point of statusPoints) {
      const checkTime = new Date(point.checkedAt).getTime();
      const windowStart = bucket0End - WINDOW_MINUTES * 60 * 1000;

      // Only consider checks within the time window
      if (checkTime < windowStart || checkTime > bucket0End) {
        continue;
      }

      // Find the bucket this check belongs to
      for (const bucket of buckets) {
        // Check falls within this bucket's time range
        // Use >= start and < end to ensure each check maps to exactly one bucket
        if (checkTime >= bucket.start && checkTime < bucket.end) {
          // If bucket already has a check, keep the most recent one
          if (
            !bucket.check ||
            new Date(point.checkedAt).getTime() >
              new Date(bucket.check.checkedAt).getTime()
          ) {
            bucket.check = point;
          }
          break;
        }
      }
    }

    // Count checks within the window (filled buckets)
    let checksInWindow = 0;

    // Map buckets to tracker blocks
    const trackerData = buckets.map((bucket, bucketIndex) => {
      const { timeStr: fromTime, dateStr } = formatTime(bucket.start);
      const { timeStr: toTime } = formatTime(bucket.end);

      // Empty bucket: no check occurred in this interval
      if (!bucket.check) {
        return {
          key: `bucket-${bucket.start}-${bucketIndex}`,
          tooltip: `No check in this interval • ${dateStr} ${fromTime} – ${toTime}`,
          hoverEffect: false,
        } satisfies TrackerBlockProps;
      }

      // Filled bucket: show check details
      checksInWindow++;
      const isUp = bucket.check.status === "UP";
      const checkDate = new Date(bucket.check.checkedAt);
      const { timeStr: checkedTime, dateStr: checkedDateStr } = formatTime(
        checkDate.getTime(),
      );

      const tooltipParts = [
        bucket.check.status === "UP" ? "UP" : "DOWN",
        `${checkedDateStr} ${checkedTime}`,
      ];
      if (bucket.check.responseTimeMs !== null) {
        tooltipParts.push(`${bucket.check.responseTimeMs}ms`);
      }
      const tooltip = tooltipParts.join(" • ");

      return {
        key: `bucket-${bucket.start}-${bucket.check.checkedAt}`,
        color: isUp ? "bg-indigo-600 dark:bg-indigo-500" : "bg-destructive",
        tooltip,
        hoverEffect: true,
        hoverCardClassName: isUp
          ? "border-black/30 bg-white/10 text-black dark:border-white/30 dark:bg-white/10 dark:text-white"
          : "border-destructive/20 bg-destructive/10 text-destructive",
      } satisfies TrackerBlockProps;
    });

    return { trackerData, checksInWindow };
  };

  // DAILY AGGREGATION: Group status events by calendar day and calculate downtime metrics.
  // Each day is represented as one tick in the tracker, showing overall health for that day.
  const buildDailyTrackerData = (
    statusPoints: Array<{
      status: "UP" | "DOWN";
      checkedAt: Date | string;
      responseTimeMs: number | null;
    }>,
  ): { trackerData: TrackerBlockProps[]; daysInWindow: number } => {
    const { DAY_WINDOW_COUNT, TIMEZONE } = TRACKER_CONFIG;
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    // Helper: Get date string key in timezone (YYYY-MM-DD format)
    // Used for grouping checks by calendar day in the target timezone
    const getDayKey = (timestamp: number): string => {
      const date = new Date(timestamp);
      return date.toLocaleDateString("en-CA", {
        timeZone: TIMEZONE,
      }); // en-CA gives YYYY-MM-DD format
    };

    // Helper: Get start of day timestamp in timezone (for day boundaries)
    // Calculates the UTC timestamp that represents midnight in the target timezone
    const getDayStartFromKey = (dayKey: string): number => {
      const [year, month, day] = dayKey.split("-").map(Number);
      // Create a date at noon UTC (avoids DST edge cases)
      const noonUTC = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

      // Get what this UTC time represents in the target timezone
      const tzFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      const tzParts = tzFormatter.formatToParts(noonUTC);
      const tzYear = parseInt(tzParts.find((p) => p.type === "year")!.value);
      const tzMonth = parseInt(tzParts.find((p) => p.type === "month")!.value);
      const tzDay = parseInt(tzParts.find((p) => p.type === "day")!.value);
      const tzHour = parseInt(tzParts.find((p) => p.type === "hour")!.value);
      const tzMinute = parseInt(
        tzParts.find((p) => p.type === "minute")!.value,
      );

      // Calculate offset: difference between UTC noon and timezone representation
      const tzNoon = new Date(
        Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, 0),
      );
      const offset = noonUTC.getTime() - tzNoon.getTime();

      // Midnight in timezone = UTC midnight adjusted by the same offset
      const utcMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      return utcMidnight.getTime() - offset;
    };

    // Helper: Format date for tooltip
    const formatDate = (timestamp: number) => {
      const date = new Date(timestamp);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: TIMEZONE,
      });
    };

    // Early return if no status points
    if (statusPoints.length === 0) {
      const trackerData = Array.from(
        { length: DAY_WINDOW_COUNT },
        (_: unknown, dayIndex: number) => {
          return {
            key: `day-empty-${dayIndex}`,
            tooltip: "No data recorded",
            hoverEffect: false,
          } satisfies TrackerBlockProps;
        },
      );
      return { trackerData, daysInWindow: 0 };
    }

    // Find the most recent check to anchor the day window
    const mostRecentTime = Math.max(
      ...statusPoints.map((point) => new Date(point.checkedAt).getTime()),
    );

    // Create day buckets: each bucket represents one calendar day
    // Use day keys (YYYY-MM-DD strings) for grouping
    const dayBuckets: Map<
      string,
      {
        dayKey: string;
        dayStart: number;
        checks: Array<{
          status: "UP" | "DOWN";
          checkedAt: number;
          responseTimeMs: number | null;
        }>;
      }
    > = new Map();

    // Initialize all day buckets in the window
    // Generate day keys for the last DAY_WINDOW_COUNT days
    const today = new Date(mostRecentTime);
    for (let i = 0; i < DAY_WINDOW_COUNT; i++) {
      const dayDate = new Date(today);
      dayDate.setDate(today.getDate() - i);
      const dayKey = getDayKey(dayDate.getTime());
      const dayStart = getDayStartFromKey(dayKey);
      dayBuckets.set(dayKey, { dayKey, dayStart, checks: [] });
    }

    // Group checks by calendar day
    for (const point of statusPoints) {
      const checkTime = new Date(point.checkedAt).getTime();
      const dayKey = getDayKey(checkTime);

      // Only consider checks within the day window
      if (!dayBuckets.has(dayKey)) {
        continue;
      }

      const bucket = dayBuckets.get(dayKey)!;
      bucket.checks.push({
        status: point.status,
        checkedAt: checkTime,
        responseTimeMs: point.responseTimeMs,
      });
    }

    // Calculate downtime and uptime for each day
    // Sort buckets by day key (oldest first, which is lexicographically correct for YYYY-MM-DD)
    const sortedDays = Array.from(dayBuckets.values()).sort((a, b) =>
      a.dayKey.localeCompare(b.dayKey),
    );

    let daysInWindow = 0;
    const trackerData = sortedDays.map((bucket, dayIndex) => {
      const { dayKey, dayStart, checks } = bucket;

      // No checks for this day
      if (checks.length === 0) {
        return {
          key: `day-${dayKey}-${dayIndex}`,
          tooltip: `No data recorded • ${formatDate(dayStart)}`,
          hoverEffect: false,
        } satisfies TrackerBlockProps;
      }

      daysInWindow++;

      // Calculate downtime duration for the day
      // Sort checks by time to process chronologically
      const sortedChecks = [...checks].sort(
        (a, b) => a.checkedAt - b.checkedAt,
      );

      let downtimeMinutes = 0;
      let lastDownTime: number | null = null;
      const dayEnd = dayStart + MS_PER_DAY;

      // Process checks chronologically to calculate downtime
      // If a check is DOWN, start tracking downtime until next UP check
      for (let i = 0; i < sortedChecks.length; i++) {
        const check = sortedChecks[i];
        const isDown = check.status === "DOWN";

        if (isDown && lastDownTime === null) {
          // Start of downtime period
          lastDownTime = check.checkedAt;
        } else if (!isDown && lastDownTime !== null) {
          // End of downtime period
          const downtimeMs = check.checkedAt - lastDownTime;
          downtimeMinutes += downtimeMs / (60 * 1000);
          lastDownTime = null;
        }
      }

      // If day ended while still down, add remaining downtime
      if (lastDownTime !== null) {
        const downtimeMs = dayEnd - lastDownTime;
        downtimeMinutes += downtimeMs / (60 * 1000);
      }

      // Calculate uptime percentage
      const totalMinutesInDay = 24 * 60;
      const uptimeMinutes = totalMinutesInDay - downtimeMinutes;
      const uptimePercentage = (uptimeMinutes / totalMinutesInDay) * 100;

      // Determine color based on uptime
      // Fully UP (100%) → indigo (up color)
      // Partially DOWN (0% < uptime < 100%) → amber (warning color)
      // Fully DOWN (0%) → destructive (down color)
      let color: string;
      let hoverCardClassName: string;

      if (uptimePercentage === 100) {
        // Fully UP
        color = "bg-indigo-600 dark:bg-indigo-500";
        hoverCardClassName =
          "border-indigo-600/30 bg-indigo-600/10 text-indigo-600 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300";
      } else if (uptimePercentage === 0) {
        // Fully DOWN
        color = "bg-destructive";
        hoverCardClassName =
          "border-destructive/20 bg-destructive/10 text-destructive";
      } else {
        // Partially DOWN (warning)
        color = "bg-amber-500 dark:bg-amber-500";
        hoverCardClassName =
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400";
      }

      // Format downtime for tooltip
      const downtimeStr =
        downtimeMinutes < 1
          ? "<1m"
          : downtimeMinutes < 60
            ? `${Math.round(downtimeMinutes)}m`
            : `${Math.floor(downtimeMinutes / 60)}h ${Math.round(downtimeMinutes % 60)}m`;

      const tooltip = [
        formatDate(dayStart),
        `Downtime: ${downtimeStr}`,
        `Uptime: ${uptimePercentage.toFixed(2)}%`,
      ].join(" • ");

      return {
        key: `day-${dayKey}-${dayIndex}`,
        color,
        tooltip,
        hoverEffect: true,
        hoverCardClassName,
      } satisfies TrackerBlockProps;
    });

    return { trackerData, daysInWindow };
  };

  // Memoize processed websites data to avoid recalculating on every render
  const processedWebsites = useMemo(() => {
    if (!statusQuery.data?.websites) return [];
    return statusQuery.data.websites.map((website) => {
      const hasData = website.statusPoints.length > 0;

      // Use appropriate tracker based on view mode
      let trackerData: TrackerBlockProps[];
      let checksInWindow = 0;
      let daysInWindow = 0;

      if (viewMode === "per-day") {
        const result = buildDailyTrackerData(
          hasData ? website.statusPoints : [],
        );
        trackerData = result.trackerData;
        daysInWindow = result.daysInWindow;
      } else {
        const result = getTrackerData(hasData ? website.statusPoints : []);
        trackerData = result.trackerData;
        checksInWindow = result.checksInWindow;
      }

      const hasCloudflareBlock = website.currentStatus?.httpStatusCode === 403;

      return {
        website,
        trackerData,
        checksInWindow,
        daysInWindow,
        hasData,
        badge: buildStatusBadge(website.currentStatus),
        hasCloudflareBlock,
      };
    });
  }, [statusQuery.data, viewMode]);

  return (
    <div className="relative">
      {/* Left diagonal stripe border */}
      <div
        className={cx(
          "diagonal-stripes pointer-events-none absolute -top-28 hidden w-5 lg:block",
          embedded ? "bottom-0 left-0" : "-bottom-16 -left-5",
        )}
        aria-hidden="true"
      />
      {/* Right diagonal stripe border */}
      <div
        className={cx(
          "diagonal-stripes pointer-events-none absolute -top-28 hidden w-5 lg:block",
          embedded ? "bottom-0 right-0" : "-bottom-16 -right-5",
        )}
        aria-hidden="true"
      />

      <div
        className={cx(
          "w-full",
          embedded ? "px-6 lg:px-8" : "mx-auto max-w-5xl px-4 pt-28 pb-16",
        )}
      >
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
        ) : (
          <>
            {!embedded && (
              <>
                {/* Breadcrumb Navigation */}
                <Breadcrumb className="mb-6">
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link href="/" className="flex items-center gap-1.5">
                          <Home className="size-4" />
                          <span>Home</span>
                        </Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link href="/dashboard">Dashboard</Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>Status</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                      Website Status
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      Monitor the uptime status of your websites.
                    </p>
                  </div>
                </div>
              </>
            )}

            <div className="mt-8 rounded-2xl border border-border bg-card text-card-foreground">
              <div className="border-b border-border px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Status Overview</h2>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-1">
                    <button
                      onClick={() => setViewMode("per-check")}
                      className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        viewMode === "per-check"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Per Check
                    </button>
                    <button
                      onClick={() => setViewMode("per-day")}
                      className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        viewMode === "per-day"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Per Day
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4">
                {statusQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : statusQuery.isError ? (
                  <p className="text-sm text-muted-foreground">
                    Couldn’t load status right now.{" "}
                    <Link
                      href="/dashboard"
                      className="underline underline-offset-4"
                    >
                      Go back to dashboard
                    </Link>
                    .
                  </p>
                ) : !statusQuery.data?.websites?.length ? (
                  <p className="text-sm text-muted-foreground">
                    No websites found.{" "}
                    <Link
                      href="/dashboard"
                      className="underline underline-offset-4"
                    >
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
                      ({
                        website,
                        trackerData,
                        checksInWindow,
                        daysInWindow,
                        hasData,
                        badge,
                        hasCloudflareBlock,
                      }) => (
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
                              {badge.isUp ? (
                                <div
                                  className={badge.className}
                                  title={badge.tooltip}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <div className="relative size-4 shrink-0">
                                      <div className="absolute inset-[1px] rounded-full bg-emerald-500/20 dark:bg-emerald-600/20" />
                                      <div className="absolute inset-1 rounded-full bg-emerald-600 dark:bg-emerald-500" />
                                    </div>
                                    <span className="text-xs text-gray-700 dark:text-gray-50">
                                      {badge.label}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${badge.className}`}
                                  title={badge.tooltip}
                                >
                                  <span className="inline-block size-2 rounded-full bg-current" />
                                  <span>{badge.label}</span>
                                </div>
                              )}
                              {hasData && (
                                <div className="text-sm text-muted-foreground">
                                  {viewMode === "per-day"
                                    ? `${daysInWindow} day${daysInWindow !== 1 ? "s" : ""}`
                                    : `${checksInWindow}/${TRACKER_CONFIG.SLOT_COUNT} check${checksInWindow !== 1 ? "s" : ""}`}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                              {viewMode === "per-day"
                                ? `Last ${TRACKER_CONFIG.DAY_WINDOW_COUNT} days`
                                : `Last ${TRACKER_CONFIG.WINDOW_MINUTES} minutes (${TRACKER_CONFIG.CHECK_INTERVAL_MINUTES}-minute intervals)`}
                            </p>
                            <Tracker data={trackerData} hoverEffect={hasData} />
                          </div>
                          {hasCloudflareBlock && (
                            <Alert className="border-amber-500/50 bg-amber-500/10">
                              <AlertDescription className="text-amber-700 dark:text-amber-400">
                                <span className="font-medium">
                                  Cloudflare detected:
                                </span>{" "}
                                We&apos;re receiving a 403 Forbidden response.
                                For accurate monitoring, disable the Cloudflare
                                proxy (orange cloud → gray cloud).
                              </AlertDescription>
                            </Alert>
                          )}
                          {!hasData ? (
                            <div className="text-sm text-muted-foreground">
                              No status data available yet. Checks will appear
                              here once monitoring begins.
                            </div>
                          ) : null}
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
