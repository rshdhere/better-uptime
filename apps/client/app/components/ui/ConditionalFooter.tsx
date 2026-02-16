"use client";

import { usePathname } from "next/navigation";
import Footer from "@/components/ui/Footer";

export function ConditionalFooter() {
  const pathname = usePathname();

  //INFO: In futrure, we can play footer display from here
  if (pathname?.startsWith("/dashboard")) return null;
  return <Footer />;
}
