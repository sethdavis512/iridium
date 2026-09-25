FROM oven/bun:1-alpine AS development-dependencies-env
# Dependency stages copy only the manifest and lockfile, so their install
# layers stay cached until dependencies change. Source enters in build-env.
COPY ./package.json bun.lock /app/
WORKDIR /app
RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS production-dependencies-env
COPY ./package.json bun.lock /app/
WORKDIR /app
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine AS build-env
# node_modules before the source, so a source-only change reuses this layer.
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
COPY . /app/
WORKDIR /app
# prisma generate only reads the schema -- no DB connection needed.
# Provide a placeholder so prisma.config.ts can resolve env('DATABASE_URL').
RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" bunx --bun prisma generate && bun run build

FROM node:24-alpine
ENV NODE_ENV=production
RUN apk add --no-cache tini wget \
    && addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --chown=app:app ./package.json /app/
COPY --chown=app:app --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --chown=app:app --from=development-dependencies-env /app/node_modules/prisma /app/node_modules/prisma
COPY --chown=app:app --from=development-dependencies-env /app/node_modules/@prisma/engines /app/node_modules/@prisma/engines
COPY --chown=app:app --from=build-env /app/build /app/build
COPY --chown=app:app ./prisma /app/prisma
COPY --chown=app:app ./prisma.config.ts /app/prisma.config.ts
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/healthcheck > /dev/null || exit 1
# tini is PID 1: it forwards SIGTERM to the server and reaps zombies.
ENTRYPOINT ["/sbin/tini", "--"]
# Plain Docker hosts: apply pending migrations on boot, then exec node so it
# receives signals directly, with no npm or shell in between. `migrate deploy`
# is a no-op when the schema is already current, so restarts are safe. Needs
# DATABASE_URL at runtime; the copied prisma CLI + engines (above) make this
# work. On Railway the start command in .railway/railway.ts replaces both
# ENTRYPOINT and CMD (so it names tini itself), and migrations run once per
# deploy in the pre-deploy step.
CMD ["sh", "-c", "npx --no-install prisma migrate deploy && exec node node_modules/@react-router/serve/bin.cjs build/server/index.js"]
