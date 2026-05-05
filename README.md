# HaContainer Dashboard

Single Next.js production dashboard for HaContainer Super-Pharm operations.

## Run Locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Production

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

The app builds with Next.js standalone output enabled. `pnpm start` runs
`.next/standalone/server.js`; for deployment, set the same environment
variables from `.env.example` in the hosting provider.

## Structure

```text
app/          Next.js App Router pages and API routes
components/   Dashboard UI components
lib/shared/   Pricing and Super-Pharm OF01 helpers used by API routes
providers/    Refine, auth, access-control, data, and theme providers
supabase/     Database migrations
utils/        Supabase and formatting utilities
```

## Checks

```bash
pnpm typecheck
pnpm build
```
