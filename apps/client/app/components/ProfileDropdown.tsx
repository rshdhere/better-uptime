"use client";

import * as React from "react";
import { cx } from "@/lib/utils";
import { Settings, LogOut, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/DropdownMenu";

interface Profile {
  name: string;
  email: string;
  avatar?: string;
}

interface MenuItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface ProfileDropdownProps extends React.HTMLAttributes<HTMLDivElement> {
  data: Profile;
}

export default function ProfileDropdown({
  data,
  className,
  ...props
}: ProfileDropdownProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);

  const menuItems: MenuItem[] = [
    {
      label: "Profile",
      href: "#",
      icon: <User className="w-4 h-4" />,
    },
    {
      label: "Settings",
      href: "#",
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  const handleSignOut = () => {
    localStorage.removeItem("token");
    window.dispatchEvent(new Event("auth-change"));
    router.push("/login");
  };

  // Generate initials from name
  const initials = data.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className={cx("relative", className)} {...props}>
      <DropdownMenu onOpenChange={setIsOpen}>
        <div className="group relative">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cx(
                "flex items-center gap-16 p-3 rounded-2xl cursor-pointer",
                "bg-card border border-border",
                "hover:border-muted-foreground/30 hover:bg-accent/50",
                "hover:shadow-sm transition-all duration-200 focus:outline-none",
              )}
            >
              <div className="text-left flex-1">
                <div className="text-sm font-medium text-foreground tracking-tight leading-tight">
                  {data.name}
                </div>
                <div className="text-xs text-muted-foreground tracking-tight leading-tight">
                  {data.email}
                </div>
              </div>
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-linear-to-br from-indigo-500 via-purple-500 to-pink-400 p-0.5">
                  <div className="w-full h-full rounded-full overflow-hidden bg-card flex items-center justify-center">
                    {data.avatar ? (
                      <Image
                        src={data.avatar}
                        alt={data.name}
                        width={36}
                        height={36}
                        className="w-full h-full object-cover rounded-full"
                      />
                    ) : (
                      <span className="text-sm font-medium text-foreground">
                        {initials}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          </DropdownMenuTrigger>

          {/* Bending line indicator on the right */}
          <div
            className={cx(
              "absolute -right-3 top-1/2 -translate-y-1/2 transition-all duration-200",
              isOpen ? "opacity-100" : "opacity-60 group-hover:opacity-100",
            )}
          >
            <svg
              width="12"
              height="24"
              viewBox="0 0 12 24"
              fill="none"
              className={cx(
                "transition-all duration-200",
                isOpen
                  ? "text-indigo-500 dark:text-indigo-400 scale-110"
                  : "text-muted-foreground group-hover:text-foreground/70",
              )}
              aria-hidden="true"
            >
              <path
                d="M2 4C6 8 6 16 2 20"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>

          <DropdownMenuContent align="end" sideOffset={4} className="w-64">
            <div className="space-y-1">
              {menuItems.map((item) => (
                <DropdownMenuItem key={item.label} asChild>
                  <Link
                    href={item.href}
                    className={cx(
                      "flex items-center gap-2 p-3 rounded-xl transition-all duration-200 cursor-pointer group/item",
                      "hover:shadow-sm border border-transparent",
                      "hover:border-border/50",
                    )}
                  >
                    <span className="text-muted-foreground group-hover/item:text-foreground transition-colors">
                      {item.icon}
                    </span>
                    <span className="text-sm font-medium text-foreground tracking-tight leading-tight whitespace-nowrap group-hover/item:text-foreground transition-colors">
                      {item.label}
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <button
                type="button"
                onClick={handleSignOut}
                className={cx(
                  "w-full flex items-center gap-3 p-3 duration-200 rounded-xl cursor-pointer",
                  "bg-destructive/10 hover:bg-destructive/20",
                  "border border-transparent hover:border-destructive/30 hover:shadow-sm transition-all group/signout",
                )}
              >
                <LogOut className="w-4 h-4 text-destructive group-hover/signout:text-destructive" />
                <span className="text-sm font-medium text-destructive group-hover/signout:text-destructive">
                  Sign Out
                </span>
              </button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </div>
      </DropdownMenu>
    </div>
  );
}

export { ProfileDropdown };
