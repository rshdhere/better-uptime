import Link from "next/link";
import { siteConfig } from "@/siteConfig";

export function DesktopNav() {
  return (
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
  );
}
