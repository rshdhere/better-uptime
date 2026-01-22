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
      interpreter: "none",
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
      script: "/root/.bun/bin/bun",
      args: "src/bin.ts",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: "8084",
      },
      max_memory_restart: "400M",
    },

    /**
     * =========================
     * Worker (Bun)
     * =========================
     */
    {
      name: "uptique-worker-production",
      cwd: "./apps/worker",
      script: "/root/.bun/bin/bun",
      args: "src/index.ts",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "400M",
    },

    /**
     * =========================
     * Publisher (Bun)
     * =========================
     */
    {
      name: "uptique-publisher-production",
      cwd: "./apps/publisher",
      script: "/root/.bun/bin/bun",
      args: "src/index.ts",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "300M",
    },
  ],
};
