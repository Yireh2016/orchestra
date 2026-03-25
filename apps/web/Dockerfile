# ─── Dependencies stage ───────────────────────────────────────────────────────
FROM node:22-slim AS deps

WORKDIR /app

COPY apps/web/package.json apps/web/package-lock.json* ./
RUN npm install

# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-slim AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY apps/web/package.json ./
COPY apps/web/next.config.ts ./
COPY apps/web/tsconfig.json ./
COPY apps/web/postcss.config.mjs ./
COPY apps/web/src ./src

# If there's a public directory, copy it
COPY apps/web/public* ./public/

ENV NEXT_TELEMETRY_DISABLED=1
RUN npx next build

# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:22-slim AS production

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --gid 1001 orchestra && \
    useradd --uid 1001 --gid orchestra --shell /bin/bash --create-home orchestra

# Copy standalone output from Next.js build
COPY --from=build --chown=orchestra:orchestra /app/.next/standalone ./
COPY --from=build --chown=orchestra:orchestra /app/.next/static ./.next/static
COPY --from=build --chown=orchestra:orchestra /app/public ./public

USER orchestra

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
