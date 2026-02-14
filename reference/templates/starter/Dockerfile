# Multi-stage build for Starter App (Monorepo)
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy root package files
COPY pnpm-workspace.yaml .npmrc ./
COPY package.json pnpm-lock.yaml ./

# Copy shared packages
COPY packages ./packages
COPY apps/starter/package.json ./apps/starter/

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages

# Copy root config files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json tsconfig.json ./

# Copy shared packages source
COPY packages ./packages

# Copy app source
COPY apps/starter ./apps/starter

# Build shared packages first
RUN pnpm --filter '@saveaday/shared-types' build && \
    pnpm --filter '@saveaday/shared-utils' build && \
    pnpm --filter '@saveaday/shared-firebase' build && \
    pnpm --filter '@saveaday/shared-auth' build && \
    pnpm --filter '@saveaday/shared-ui' build && \
    pnpm --filter '@saveaday/integrations' build || true

# Build the application
WORKDIR /app
RUN cd apps/starter && NODE_PATH=/app/node_modules:/app/apps/starter/node_modules /app/node_modules/.bin/next build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application from standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/starter/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/starter/.next/static ./apps/starter/.next/static
COPY --chown=nextjs:nodejs creds ./creds
COPY --from=builder --chown=nextjs:nodejs /app/apps/starter/public ./apps/starter/public

USER nextjs

EXPOSE 8080

ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/starter/server.js"]
