# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-slim AS build

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY apps/core/package.json apps/core/package-lock.json* ./
RUN npm install

# Copy prisma schema and generate client
COPY apps/core/prisma ./prisma
RUN npx prisma generate

# Copy source and compile TypeScript
COPY apps/core/tsconfig.json ./
COPY apps/core/nest-cli.json ./
COPY apps/core/src ./src
RUN npx nest build

# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:22-slim AS production

RUN apt-get update && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only
COPY apps/core/package.json apps/core/package-lock.json* ./
RUN npm install --production

# Copy prisma schema and generated client from build stage
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

# Copy compiled output
COPY --from=build /app/dist ./dist

# Create non-root user
RUN groupadd --gid 1001 orchestra && \
    useradd --uid 1001 --gid orchestra --shell /bin/bash --create-home orchestra
USER orchestra

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/main.js"]
