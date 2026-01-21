import React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Navigation } from "@/components/ui/Navbar";
import Footer from "@/components/ui/Footer";
import { TRPCProvider } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Turborepo Template",
  description: "Full-stack TypeScript monorepo template",
  icons: {
    icon: "/circle_logo.png",
    apple: "/circle_logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.className} min-h-screen scroll-auto antialiased selection:bg-indigo-100 selection:text-indigo-700 bg-background text-foreground dark:bg-gray-950`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TRPCProvider>
            <Navigation />
            <main className="min-h-screen">{children}</main>
            <Footer />
          </TRPCProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
