# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# HaContainer dashboard — production image for Railway / any Docker host.
# Multi-stage build using pnpm (declared in package.json packageManager field)
# and Next.js standalone output (`output: "standalone"` in next.config.js).
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=20.18.0
ARG PNPM_VERSION=9.12.0

# ── deps stage: install dependencies (cached) ────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
ARG PNPM_VERSION
RUN apk add --no-cache libc6-compat \
 && corepack enable \
 && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml* .npmrc* ./
RUN pnpm install --frozen-lockfile

# ── build stage: compile + run standalone prep ───────────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder
ARG PNPM_VERSION
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
# `pnpm build` runs `next build && node scripts/prepare-standalone.mjs`,
# which produces .next/standalone with public/ and .next/static copied in.
RUN pnpm build

# ── runtime stage: minimal image, only standalone bundle ─────────────────────
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js standalone server respects PORT and HOSTNAME from env. Railway sets
# PORT automatically; HOSTNAME defaults to localhost which doesn't accept
# external connections, so pin it to 0.0.0.0 here.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/.next ./.next

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
