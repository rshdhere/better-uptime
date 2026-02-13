"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";
import {
  Activity,
  BarChart3,
  Heart,
  HelpCircle,
  LayoutGrid,
  Plus,
  Settings,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { useDashboardUser } from "@/lib/use-dashboard-user";
import { Button } from "@/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/DropdownMenu";
import ThemeSwitch from "@/components/ThemeSwitch";

const NAV_ITEMS = [
  {
    name: "Monitors",
    href: "/dashboard",
    icon: Activity,
    exact: true,
  },
  {
    name: "Incidents",
    href: "/dashboard/incidents",
    icon: LayoutGrid,
  },
  {
    name: "Heartbeats",
    href: "/dashboard/heartbeats",
    icon: Heart,
  },
  {
    name: "Status Pages",
    href: "/dashboard/status-pages",
    icon: BarChart3,
  },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const user = useDashboardUser();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden md:flex w-64 flex-col border-r border-border bg-sidebar-bg transition-all overflow-hidden shrink-0">
      {/* Quick Create Button */}
      <div className="shrink-0 px-3 pt-4 pb-2">
        <Button
          variant="primary"
          className="w-full justify-start gap-2 font-medium shadow-sm hover:shadow-md transition-all"
        >
          <Plus className="size-4" />
          Quick Create
        </Button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-4 overflow-y-auto min-h-0">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname?.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Actions */}
      <div className="shrink-0 border-t border-border p-3 space-y-3">
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            Theme
          </span>
          <ThemeSwitch />
        </div>
        <Link
          href="/dashboard/settings"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        >
          <Settings className="size-4" />
          Settings
        </Link>
        <Link
          href="/help"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        >
          <HelpCircle className="size-4" />
          Get Help
        </Link>
      </div>

      {/* User Profile - shrink-0 so it stays visible at bottom */}
      <div className="shrink-0 border-t border-border p-3 bg-sidebar-bg">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-sidebar-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar-bg"
              aria-label="Open user menu"
            >
              {user.avatarUrl ? (
                <div className="relative size-8 shrink-0 overflow-hidden rounded-full bg-sidebar-accent">
                  <Image
                    src={user.avatarUrl}
                    alt=""
                    width={32}
                    height={32}
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="size-8 shrink-0 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold text-sidebar-accent-foreground">
                  {user.isLoading
                    ? "…"
                    : user.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0 overflow-hidden">
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
          <DropdownMenuContent className="w-56" align="end" forceMount>
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
      </div>
    </aside>
  );
}
