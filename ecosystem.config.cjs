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
     * RESTART PROTECTION:
     * The worker watchdog calls process.exit(1) when the main loop is frozen
     * (stuck Redis/DB await). PM2 restarts it automatically.
     * exp_backoff_restart_delay prevents restart storms: 100ms, 200ms, 400ms...
     * max_restarts caps total restarts in the min_uptime window.
     */
    {
      name: "uptique-worker-production",
      cwd: "./apps/worker",
      script: "/root/.bun/bin/bun",
      args: "run start",
      interpreter: "none",
      max_restarts: 20,
      min_uptime: "30s",
      exp_backoff_restart_delay: 100,
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
