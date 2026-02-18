# store

Database and Prisma store for the monorepo.

## Setup

Install dependencies:

```bash
bun install
```

Run:

```bash
bun run index.ts
```

## Database

### Supported adapters

- **Neon** — [neon.tech](https://neon.tech) (serverless Postgres)

Set `DATABASE_URL` to your Neon connection string in `packages/config/.env`.

### Migrations (Prisma)

| Task | From repo root | From this package |
|------|----------------|--------------------|
| Apply existing migrations | `pnpm run db:deploy` | `pnpm run prisma:deploy` |
| Add table / change schema | `pnpm run db:migrate` | `pnpm run prisma:migrate` |
| Open Prisma Studio | `pnpm run db:studio` | `pnpm run prisma:studio` |

- **Apply** — Run after changing `DATABASE_URL` or on deploy.
- **Migrate** — Edit `prisma/schema.prisma`, run `db:migrate`, then commit the new `prisma/migrations/` folder.

---

This package was created with `bun init`. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
