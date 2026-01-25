FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app

RUN npm install -g pnpm@9.0.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json ./packages/config/
COPY packages/store/package.json ./packages/store/
COPY packages/ui/package.json ./packages/ui/
COPY apps/client/package.json ./apps/client/

RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps ./apps

COPY packages ./packages
COPY apps/client ./apps/client
COPY turbo.json ./
COPY tsconfig.json ./

RUN cd apps/client && pnpm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/client/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/client/.next/static ./apps/client/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/client/public ./apps/client/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

WORKDIR /app
CMD ["node", "apps/client/server.js"]
