"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { RiCloseLine, RiMenuLine } from "@remixicon/react";
import { Button } from "../Button";
import { siteConfig } from "@/siteConfig";

export function MobileNav() {
  const router = useRouter();
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

    return () => {
      mediaQuery.removeEventListener("change", handleMediaQueryChange);
    };
  }, []);

  React.useEffect(() => {
    const checkAuth = () => {
      setIsLoggedIn(!!localStorage.getItem("token"));
    };

    checkAuth();
    window.addEventListener("auth-change", checkAuth);

    return () => {
      window.removeEventListener("auth-change", checkAuth);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.dispatchEvent(new Event("auth-change"));
    setIsLoggedIn(false);
    router.push("/login");
  };

  return (
    <>
      <div className="flex gap-x-2 md:hidden">
        {isLoggedIn ? (
          <Button onClick={handleLogout}>Logout</Button>
        ) : (
          <Button asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        )}
        <Button
          onClick={() => setOpen((prev) => !prev)}
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
      {open && (
        <nav className="my-6 flex text-lg ease-in-out will-change-transform md:hidden">
          <ul className="space-y-4 font-medium">
            {isLoggedIn && (
              <li
                onClick={() => {
                  setOpen(false);
                  router.push("/dashboard");
                }}
              >
                Dashboard
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
      )}
    </>
  );
}
