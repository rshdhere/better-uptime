"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";
import {
  Activity,
  BarChart3,
  Heart,
  HelpCircle,
  LayoutGrid,
  Moon,
  Plus,
  Settings,
  Sun,
  LogOut,
  User,
  ChevronDown,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/DropdownMenu";

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
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Use state for user info, similar to Navigation component
  const [user, setUser] = useState<{ name: string; email: string } | null>(
    null,
  );

  useEffect(() => {
    setMounted(true);
    // Rough simulation of getting user data from storage or query
    // In a real app this might come from a context or hook
    const token = localStorage.getItem("token");
    if (token) {
      // Placeholder - in reality we might want to fetch user profile
      // using the trpc query from a parent or context
      setUser({ name: "User", email: "user@example.com" });
    }
  }, []);

  // Avoid hydration mismatch
  if (!mounted) return null;

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden md:flex w-64 flex-col border-r border-border/50 bg-[var(--sidebar-bg)] transition-all">
      {/* Header / Logo */}
      <div className="flex h-16 items-center px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-xl tracking-tight text-foreground"
        >
          <Activity className="size-6 text-[var(--coral-accent)]" />
          <span>NIGHTWATCH</span>
        </Link>
      </div>

      {/* Quick Create Button */}
      <div className="px-3 py-2">
        <Button className="w-full justify-start gap-2 bg-[var(--coral-accent)] hover:bg-[var(--coral-accent)]/90 text-white font-medium shadow-sm hover:shadow-md transition-all">
          <Plus className="size-4" />
          Quick Create
        </Button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
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
                  ? "bg-stone-200/50 text-foreground dark:bg-stone-800/50"
                  : "text-muted-foreground hover:bg-stone-100 dark:hover:bg-stone-900/50 hover:text-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Actions */}
      <div className="border-t border-border/50 p-3 space-y-1">
        <Link
          href="/dashboard/settings"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-stone-100 dark:hover:bg-stone-900/50 hover:text-foreground"
        >
          <Settings className="size-4" />
          Settings
        </Link>
        <Link
          href="/help"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-stone-100 dark:hover:bg-stone-900/50 hover:text-foreground"
        >
          <HelpCircle className="size-4" />
          Get Help
        </Link>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-stone-100 dark:hover:bg-stone-900/50 hover:text-foreground"
        >
          {theme === "dark" ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>
      </div>

      {/* User Profile */}
      <div className="border-t border-border/50 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-stone-100 dark:hover:bg-stone-900/50 outline-none">
              <div className="size-8 rounded-full bg-stone-200 dark:bg-stone-800 flex items-center justify-center text-xs font-semibold">
                {user?.name?.charAt(0) || "U"}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium text-foreground">
                  {user?.name || "User"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.email || ""}
                </p>
              </div>
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.name}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.email}
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
