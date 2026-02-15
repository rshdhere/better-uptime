"use client";

import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { BACKEND_URL } from "@repo/config/constants";
import type { AppRouter } from "server";

export const trpc = createTRPCReact<AppRouter>();

function getApiUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // In production we proxy /trpc through the frontend origin.
  if (process.env.NODE_ENV === "production") {
    return "/trpc";
  }

  return BACKEND_URL;
}

export function getTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: getApiUrl(),
        headers() {
          const token =
            typeof window !== "undefined"
              ? localStorage.getItem("token")
              : null;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        async fetch(url, options) {
          const response = await fetch(url, options);

          // On 401 UNAUTHORIZED, force logout only when a token exists.
          // Public routes should not redirect anonymous visitors to /login.
          if (response.status === 401) {
            if (typeof window !== "undefined") {
              const token = localStorage.getItem("token");
              if (token) {
                localStorage.removeItem("token");
                window.dispatchEvent(new Event("auth-change"));
                window.location.href = "/login";
              }
            }
          }

          return response;
        },
      }),
    ],
  });
}
