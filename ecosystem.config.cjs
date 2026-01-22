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
    },

    /**
     * =========================
     * API Server (Bun + tRPC)
     * =========================
     */
    {
      name: "uptique-server-production",
      cwd: "./apps/server",
      script: "/root/.bun/bin/bun",
      args: "run start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: "8084",
      },
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
      args: "run start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
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
      args: "run start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
