import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  API_HOST_PRODUCTION,
  APP_HOST_PRODUCTION,
  STATUS_PAGE_CNAME_TARGET,
} from "@repo/config/constants";

const EXCLUDED_PATH_PREFIXES = [
  "/_next",
  "/api",
  "/favicon.ico",
  "/robots.txt",
];

function normalizeHostname(rawHost: string | null): string | null {
  if (!rawHost) return null;

  const [firstHost] = rawHost.split(",");
  const host = firstHost?.trim().toLowerCase();
  if (!host) return null;

  return host.split(":")[0] || null;
}

function isPlatformHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return true;
  }

  return [APP_HOST_PRODUCTION, API_HOST_PRODUCTION, STATUS_PAGE_CNAME_TARGET]
    .map((host) => host.toLowerCase())
    .includes(hostname);
}

function isExcludedPath(pathname: string): boolean {
  return EXCLUDED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function middleware(request: NextRequest) {
  if (isExcludedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const hostname = normalizeHostname(
    request.headers.get("x-forwarded-host") || request.headers.get("host"),
  );

  if (!hostname || isPlatformHost(hostname)) {
    return NextResponse.next();
  }

  const rewrittenUrl = request.nextUrl.clone();
  rewrittenUrl.pathname = "/status";
  rewrittenUrl.searchParams.set("hostname", hostname);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-status-host", hostname);

  return NextResponse.rewrite(rewrittenUrl, {
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
