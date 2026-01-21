module.exports = {
  apps: [
    /**
     * =========================
     * Client (Next.js)
     * =========================
     */
    {
      name: "uptique-client-production",
      cwd: "./apps/client",
      script: "npm",
      args: "start -- -p 3000",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "400M",
    },

    /**
     * =========================
     * API Server (tRPC – Bun)
     * =========================
     */
    {
      name: "uptique-server-production",
      cwd: "./apps/server",
      script: "src/bin.ts",
      interpreter: "~/.bun/bin/bun",
      env: {
        NODE_ENV: "production",
        PORT: "8084",
      },
      max_memory_restart: "400M",
    },

    /**
     * =========================
     * Worker (Redis → HTTP → ClickHouse)
     * =========================
     */
    {
      name: "uptique-worker-production",
      cwd: "./apps/worker",
      script: "src/index.ts",
      interpreter: "~/.bun/bin/bun",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "400M",
    },

    /**
     * =========================
     * Publisher (Scheduler → Redis)
     * =========================
     */
    {
      name: "uptique-publisher-production",
      cwd: "./apps/publisher",
      script: "src/index.ts",
      interpreter: "~/.bun/bin/bun",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "300M",
    },
  ],
};
