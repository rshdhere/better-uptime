"use client";

import Link from "next/link";
import { type inferRouterOutputs } from "@trpc/server";
import { type AppRouter } from "server";
import {
  MoreHorizontal,
  ExternalLink,
  Pause,
  Trash2,
  Settings,
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
      <div className="flex items-center gap-4">
        {/* Status Indicator */}
        <div className="relative flex size-3 items-center justify-center">
          {isUp && (
            <div
              className={`absolute inline-flex h-full w-full animate-ping rounded-full ${statusColor} opacity-75`}
            />
          )}
          <div
            className={`relative inline-flex size-2.5 rounded-full ${statusColor}`}
          />
        </div>

        {/* Content */}
        <div className="flex flex-col gap-0.5">
          <Link
            href={website.websiteUrl}
            target="_blank"
            className="font-medium text-foreground hover:underline hover:decoration-primary-action hover:underline-offset-4"
          >
            {website.websiteName ||
              website.websiteUrl.replace(/^https?:\/\//, "")}
          </Link>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className={isUp ? "text-status-up" : "text-status-down"}>
              {isUp ? "Up" : "Down"}
            </span>
            <span>•</span>
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Placeholder for Sparkline or plain text */}
        <div className="hidden text-xs font-medium text-muted-foreground sm:block">
          3m check
        </div>

        {/* Actions Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground outline-none">
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
