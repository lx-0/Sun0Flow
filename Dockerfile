# syntax=docker/dockerfile:1

# --- Base ---
FROM node:20-alpine AS base
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/
RUN pnpm install --frozen-lockfile
RUN pnpm exec prisma generate
# Flatten Prisma client + CLI into known paths for the production image.
# pnpm stores packages under version-hashed dirs that contain glob-unfriendly
# characters; Docker COPY cannot resolve them reliably, so we dereference the
# symlinks into flat directories here.
RUN mkdir -p /prisma-flat/node_modules/@prisma /prisma-flat/node_modules/.prisma && \
    cp -rL node_modules/.prisma/client /prisma-flat/node_modules/.prisma/client && \
    cp -rL node_modules/@prisma/client /prisma-flat/node_modules/@prisma/client && \
    cp -rL node_modules/prisma /prisma-flat/node_modules/prisma && \
    cp -rL node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines /prisma-flat/node_modules/@prisma/engines

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
COPY --from=deps /prisma-flat/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /prisma-flat/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=deps /prisma-flat/node_modules/prisma ./node_modules/prisma
COPY --from=deps /prisma-flat/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY prisma ./prisma/
COPY docker-entrypoint.sh ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "./docker-entrypoint.sh"]
