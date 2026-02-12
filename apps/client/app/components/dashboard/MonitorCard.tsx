"use client";

import Link from "next/link";
import { type inferRouterOutputs } from "@trpc/server";
import { cx } from "@/lib/utils";
import { type AppRouter } from "server";
import {
  MoreHorizontal,
  ExternalLink,
  Pause,
  Trash2,
  Settings,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/DropdownMenu";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Website = RouterOutputs["website"]["status"]["websites"][number];

interface MonitorCardProps {
  website: Website;
  onDelete: (id: string) => void;
}

export function MonitorCard({ website, onDelete }: MonitorCardProps) {
  const isUp = website.currentStatus?.status === "UP";
  const responseTime = website.currentStatus?.responseTimeMs;

  // Format checked date
  const checkedAt = website.currentStatus?.checkedAt
    ? new Date(website.currentStatus.checkedAt)
    : null;

  const formattedDate = checkedAt
    ? checkedAt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Never";

  const formattedTime = checkedAt
    ? checkedAt.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      className={cx(
        "group relative rounded-xl border transition-all duration-200",
        "bg-card/50 backdrop-blur-sm",
        isUp
          ? "border-status-up/20 hover:border-status-up/40 hover:shadow-lg hover:shadow-status-up/5"
          : "border-status-down/20 hover:border-status-down/40 hover:shadow-lg hover:shadow-status-down/5",
        "hover:bg-card",
      )}
    >
      <div className="flex items-start gap-4 p-5">
        {/* Status Indicator - Larger and more prominent */}
        <div className="shrink-0">
          <div
            className={cx(
              "relative flex size-12 items-center justify-center rounded-xl transition-all",
              isUp
                ? "bg-status-up/10 ring-2 ring-status-up/20"
                : "bg-status-down/10 ring-2 ring-status-down/20",
            )}
            aria-label={isUp ? "Status: Up" : "Status: Down"}
          >
            {isUp ? (
              <CheckCircle2
                className="size-6 text-status-up"
                strokeWidth={2}
                aria-hidden
              />
            ) : (
              <XCircle
                className="size-6 text-status-down"
                strokeWidth={2}
                aria-hidden
              />
            )}
            {isUp && (
              <div className="absolute inset-0 animate-ping rounded-xl bg-status-up/20" />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Link
                href={website.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cx(
                  "block text-base font-semibold text-foreground transition-colors",
                  "hover:text-primary-action",
                  "group-hover:underline group-hover:decoration-primary-action group-hover:underline-offset-2",
                )}
              >
                {website.websiteName ||
                  website.websiteUrl.replace(/^https?:\/\//, "")}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Clock className="size-3.5" aria-hidden />
                  <span>
                    {formattedTime
                      ? `${formattedDate} at ${formattedTime}`
                      : formattedDate}
                  </span>
                </div>
                {responseTime !== null && responseTime !== undefined && (
                  <>
                    <span aria-hidden>·</span>
                    <div className="flex items-center gap-1.5">
                      <Activity className="size-3.5" aria-hidden />
                      <span>{responseTime}ms</span>
                    </div>
                  </>
                )}
                <span aria-hidden>·</span>
                <span>Every 3m</span>
              </div>
            </div>

            {/* Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cx(
                    "shrink-0 rounded-lg p-2 text-muted-foreground transition-all",
                    "hover:bg-muted hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "opacity-0 group-hover:opacity-100",
                  )}
                  aria-label="Actions"
                >
                  <MoreHorizontal className="size-5" />
                  <span className="sr-only">Actions</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <a
                    href={website.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 size-4" />
                    Visit URL
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <Pause className="mr-2 size-4" />
                  Pause monitoring
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 size-4" />
                  Configure
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(website.websiteId)}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete monitor
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Status Badge - Subtle at bottom */}
          <div className="flex items-center gap-2">
            <div
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                isUp
                  ? "bg-status-up/10 text-status-up"
                  : "bg-status-down/10 text-status-down",
              )}
            >
              {isUp ? (
                <CheckCircle2
                  className="size-3"
                  strokeWidth={2.5}
                  aria-hidden
                />
              ) : (
                <XCircle className="size-3" strokeWidth={2} aria-hidden />
              )}
              <span>{isUp ? "Operational" : "Down"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
