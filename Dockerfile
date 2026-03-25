# syntax=docker/dockerfile:1

# --- Base ---
FROM node:20-alpine AS base
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
COPY prisma ./prisma/
RUN pnpm install --frozen-lockfile
RUN pnpm exec prisma generate
# Flatten Prisma into known paths for the production image.
# shamefully-hoist puts @prisma/client and prisma at the top level, but
# .prisma/client (the generated output) lives inside the .pnpm store.
# We dereference symlinks (-L) since pnpm uses them internally.
RUN mkdir -p /prisma-flat/node_modules/.prisma && \
    cp -rL node_modules/@prisma /prisma-flat/node_modules/@prisma && \
    cp -rL node_modules/prisma /prisma-flat/node_modules/prisma && \
    cp -rL $(node -e "console.log(require.resolve('.prisma/client').replace('/index.js',''))" 2>/dev/null || \
            find node_modules/.pnpm -path '*/.prisma/client/index.js' -exec dirname {} \; | head -1) \
       /prisma-flat/node_modules/.prisma/client

# --- Sharp native build (for Alpine/musl image optimization) ---
FROM base AS sharp-builder
RUN npm install --no-package-lock --no-save sharp@^0.33.5

# --- Build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# --- Production ---
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
# The standalone output bundles its own node_modules subset; replace any
# Prisma packages it included with the fully-built versions from the deps stage.
RUN rm -rf node_modules/@prisma node_modules/prisma node_modules/.prisma
COPY --from=deps /prisma-flat/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /prisma-flat/node_modules/@prisma ./node_modules/@prisma
COPY --from=deps /prisma-flat/node_modules/prisma ./node_modules/prisma
# Install sharp for Next.js standalone image optimization (Alpine/musl native build)
COPY --from=sharp-builder /app/node_modules/sharp ./node_modules/sharp
COPY --from=sharp-builder /app/node_modules/@img ./node_modules/@img
COPY prisma ./prisma/
COPY docker-entrypoint.sh ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["sh", "./docker-entrypoint.sh"]
