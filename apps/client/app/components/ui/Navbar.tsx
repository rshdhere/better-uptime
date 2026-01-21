import { siteConfig } from "@/siteConfig";
import { cx } from "@/lib/utils";
import Link from "next/link";
import { UptiqueLogo } from "../../../public/UptiqueLogo";
import { DesktopNav } from "./NavbarDesktop";
import { MobileNav } from "./NavbarMobile";

export function Navigation() {
  return (
    <header
      className={cx(
        "fixed inset-x-3 top-4 z-50 mx-auto flex max-w-6xl transform-gpu animate-slide-down-fade justify-center overflow-hidden rounded-xl border border-transparent px-3 py-3 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1.03)] will-change-transform",
        "h-16",
        "backdrop-blur-nav max-w-3xl border-gray-100 bg-white/80 shadow-xl shadow-black/5 dark:border-white/15 dark:bg-black/70",
      )}
    >
      <div className="w-full md:my-auto">
        <div className="relative flex items-center justify-between">
          <Link href={siteConfig.baseLinks.home} aria-label="Home">
            <span className="sr-only">Company logo</span>
            <UptiqueLogo className="w-28 md:w-32" />
          </Link>
          <DesktopNav />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
