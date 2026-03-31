# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:24-slim AS builder

# Enable pnpm via corepack (same version as the project uses)
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# Copy workspace config first — better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy only the packages needed to build the bot
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

# Install all deps (needed for build tools like esbuild, typescript)
RUN pnpm install --frozen-lockfile

# Build the api-server — esbuild bundles everything into dist/
RUN pnpm --filter @workspace/api-server run build


# ─── Stage 2: Runner ─────────────────────────────────────────────────────────
FROM node:24-slim AS runner

WORKDIR /app

# Copy only the built bundle — no node_modules needed at runtime
COPY --from=builder /app/artifacts/api-server/dist/ ./dist/

# Create data directory for JSON storage
# NOTE: On Railway, mount a Volume to /app/data to persist data across deploys
RUN mkdir -p /app/data

ENV NODE_ENV=production

# Railway sets PORT automatically — default to 3000 as fallback
ENV PORT=3000
EXPOSE 3000

# Health check — Railway will also check /api/healthz via railway.json
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
