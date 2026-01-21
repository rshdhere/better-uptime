"use client";

import { siteConfig } from "@/siteConfig";
import useScroll from "@/lib/use-scroll";
import { cx } from "@/lib/utils";
import { RiCloseLine, RiMenuLine } from "@remixicon/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { UptiqueLogo } from "../../../public/UptiqueLogo";
import { Button } from "../Button";

export function Navigation() {
  const router = useRouter();
  const scrolled = useScroll(15);
  const [open, setOpen] = React.useState(false);
  const [isLoggedIn, setIsLoggedIn] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem("token");
  });

  React.useEffect(() => {
    const mediaQuery: MediaQueryList = window.matchMedia("(min-width: 768px)");
    const handleMediaQueryChange = () => {
      setOpen(false);
    };

    mediaQuery.addEventListener("change", handleMediaQueryChange);
    handleMediaQueryChange();

    return () => {
      mediaQuery.removeEventListener("change", handleMediaQueryChange);
    };
  }, []);

  // Check auth state on mount and listen for auth changes
  React.useEffect(() => {
    const checkAuth = () => {
      setIsLoggedIn(!!localStorage.getItem("token"));
    };

    checkAuth();
    // Listen for custom auth-change event (fired on login/logout)
    window.addEventListener("auth-change", checkAuth);
    // Listen for storage changes (handles cross-tab login/logout)
    window.addEventListener("storage", checkAuth);
    // Check on focus (handles cases where token was set elsewhere)
    window.addEventListener("focus", checkAuth);

    return () => {
      window.removeEventListener("auth-change", checkAuth);
      window.removeEventListener("storage", checkAuth);
      window.removeEventListener("focus", checkAuth);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    // Dispatch custom event to update navbar (though setIsLoggedIn already handles it)
    window.dispatchEvent(new Event("auth-change"));
    setIsLoggedIn(false);
    router.push("/login");
  };

  return (
    <header
      className={cx(
        "fixed inset-x-3 top-4 z-50 mx-auto flex max-w-6xl transform-gpu animate-slide-down-fade justify-center overflow-hidden rounded-xl border border-transparent px-3 py-3 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1.03)] will-change-transform",
        open === true ? "h-52" : "h-16",
        scrolled || open === true
          ? "backdrop-blur-nav max-w-3xl border-gray-100 bg-white/80 shadow-xl shadow-black/5 dark:border-white/15 dark:bg-black/70"
          : "bg-white/0 dark:bg-gray-950/0",
      )}
    >
      <div className="w-full md:my-auto">
        <div className="relative flex items-center justify-between">
          <Link href={siteConfig.baseLinks.home} aria-label="Home">
            <span className="sr-only">Company logo</span>
            <UptiqueLogo className="w-28 md:w-32" />
          </Link>
          <nav className="hidden md:absolute md:left-1/2 md:top-1/2 md:block md:-translate-x-1/2 md:-translate-y-1/2 md:transform">
            <div className="flex items-center gap-10 font-medium">
              <Link
                className="px-2 py-1 text-gray-900 dark:text-gray-50"
                href={siteConfig.baseLinks.about}
              >
                About
              </Link>
              <Link
                className="px-2 py-1 text-gray-900 dark:text-gray-50"
                href={siteConfig.baseLinks.pricing}
              >
                Pricing
              </Link>
              <Link
                className="px-2 py-1 text-gray-900 dark:text-gray-50"
                href={siteConfig.baseLinks.changelog}
              >
                Changelog
              </Link>
            </div>
          </nav>
          {isLoggedIn ? (
            <Button
              className="hidden h-10 font-semibold md:flex"
              onClick={handleLogout}
            >
              Logout
            </Button>
          ) : (
            <Button className="hidden h-10 font-semibold md:flex" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          )}
          <div className="flex gap-x-2 md:hidden">
            {isLoggedIn ? (
              <Button onClick={handleLogout}>Logout</Button>
            ) : (
              <Button asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            )}
            <Button
              onClick={() => setOpen(!open)}
              variant="light"
              className="aspect-square p-2"
            >
              {open ? (
                <RiCloseLine aria-hidden="true" className="size-5" />
              ) : (
                <RiMenuLine aria-hidden="true" className="size-5" />
              )}
            </Button>
          </div>
        </div>
        <nav
          className={cx(
            "my-6 flex text-lg ease-in-out will-change-transform md:hidden",
            open ? "" : "hidden",
          )}
        >
          <ul className="space-y-4 font-medium">
            {isLoggedIn && (
              <li onClick={() => setOpen(false)}>
                <Link href="/dashboard">Dashboard</Link>
              </li>
            )}
            <li onClick={() => setOpen(false)}>
              <Link href={siteConfig.baseLinks.about}>About</Link>
            </li>
            <li onClick={() => setOpen(false)}>
              <Link href={siteConfig.baseLinks.pricing}>Pricing</Link>
            </li>
            <li onClick={() => setOpen(false)}>
              <Link href={siteConfig.baseLinks.changelog}>Changelog</Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
