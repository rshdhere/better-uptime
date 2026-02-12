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
  Check,
  XCircle,
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
  const statusColor = isUp ? "bg-status-up" : "bg-status-down";

  // Format checked date
  const checkedAt = website.currentStatus?.checkedAt
    ? new Date(website.currentStatus.checkedAt)
    : null;

  const formattedDate = checkedAt
    ? checkedAt.toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "numeric",
      })
    : "Never";

  return (
    <div className="group relative flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary-action/20 hover:shadow-md">
      <div className="flex items-center gap-4 min-w-0">
        {/* Status: visible tick (check) for Up, X for Down */}
        <div
          className={cx(
            "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            isUp
              ? "bg-status-up/15 text-status-up"
              : "bg-status-down/15 text-status-down",
          )}
          aria-label={isUp ? "Status: Up" : "Status: Down"}
        >
          {isUp ? (
            <Check
              className="size-3.5 shrink-0"
              strokeWidth={2.5}
              aria-hidden
            />
          ) : (
            <XCircle
              className="size-3.5 shrink-0"
              strokeWidth={2}
              aria-hidden
            />
          )}
          <span>{isUp ? "Up" : "Down"}</span>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <Link
            href={website.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground hover:underline hover:decoration-primary-action hover:underline-offset-4 truncate"
          >
            {website.websiteName ||
              website.websiteUrl.replace(/^https?:\/\//, "")}
          </Link>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span>Last checked {formattedDate}</span>
            <span aria-hidden>·</span>
            <span>3m check</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Actions Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Actions"
            >
              <MoreHorizontal className="size-4" />
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
    </div>
  );
}
