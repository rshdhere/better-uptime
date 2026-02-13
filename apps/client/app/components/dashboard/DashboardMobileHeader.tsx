"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronDown, LogOut } from "lucide-react";
import { useDashboardUser } from "@/lib/use-dashboard-user";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/DropdownMenu";

export function DashboardMobileHeader() {
  const user = useDashboardUser();

  return (
    <header className="sticky top-0 z-40 flex md:hidden h-14 items-center justify-end border-b border-border bg-sidebar-bg px-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg p-2 text-left transition-colors hover:bg-sidebar-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar-bg"
            aria-label="Open user menu"
          >
            {user.avatarUrl ? (
              <div className="relative size-9 shrink-0 overflow-hidden rounded-full bg-sidebar-accent">
                <Image
                  src={user.avatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="size-9 shrink-0 rounded-full bg-primary-action flex items-center justify-center text-sm font-semibold text-primary-action-foreground">
                {user.isLoading
                  ? "…"
                  : user.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="hidden min-w-0 flex-col sm:flex">
              <p className="truncate text-sm font-medium text-foreground">
                {user.isLoading ? "Loading…" : user.displayName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.displayEmail}
              </p>
            </div>
            <ChevronDown className="size-4 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56"
          align="end"
          side="bottom"
          sideOffset={8}
        >
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {user.displayName}
              </p>
              <p className="text-xs leading-none text-muted-foreground">
                {user.displayEmail}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard/settings">Settings</Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              localStorage.removeItem("token");
              window.location.href = "/login";
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
