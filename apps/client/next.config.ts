import type { NextConfig } from "next";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from the shared config package
dotenv.config({
  path: path.resolve(__dirname, "../../packages/config/.env"),
});

const backendProxyTarget =
  process.env.INTERNAL_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_PROXY_TARGET ||
  "http://127.0.0.1:8084";

const nextConfig: NextConfig = {
  // Allow user avatars (e.g. GitHub)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "/**",
      },
    ],
  },
  // Enable MDX pages
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  // Expose env vars from the shared config package
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    CLIENT_ID_GITHUB: process.env.CLIENT_ID_GITHUB,
    CLIENT_SECRET_GITHUB: process.env.CLIENT_SECRET_GITHUB,
    NEXT_PUBLIC_GITHUB_CLIENT_ID: process.env.CLIENT_ID_GITHUB,
  },
  async rewrites() {
    return [
      {
        source: "/trpc/:path*",
        destination: `${backendProxyTarget}/:path*`,
      },
    ];
  },
  experimental: {
    mdxRs: true,
  },
  // Enable standalone output for Docker
  output: "standalone",
};

export default nextConfig;
