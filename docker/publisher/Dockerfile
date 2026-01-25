FROM oven/bun:1 AS base

FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json ./packages/config/
COPY packages/store/package.json ./packages/store/
COPY packages/streams/package.json ./packages/streams/
COPY apps/publisher/package.json ./apps/publisher/

RUN npm install -g pnpm@9.0.0

RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps ./apps

COPY packages ./packages
COPY apps/publisher ./apps/publisher
COPY turbo.json ./
COPY tsconfig.json ./

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages

COPY apps/publisher ./apps/publisher

WORKDIR /app/apps/publisher

CMD ["bun", "run", "src/index.ts"]
