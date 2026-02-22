# Stage 1: install full dependency tree (including dev deps) for the build step
FROM node:20-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci 
# Stage 2: install only production dependencies for the final runtime image
FROM node:20-alpine AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev 
# Stage 3: compile the app with the full dependency tree
FROM node:20-alpine AS build-env
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npm run build

# Stage 4: slim runtime image with compiled artifacts and production deps
FROM node:20-alpine
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
COPY --from=build-env /app/prisma /app/prisma
COPY --from=build-env /app/prisma.config.ts /app/prisma.config.ts
COPY --from=build-env /app/app/generated /app/app/generated
COPY ./docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
WORKDIR /app
CMD ["/app/docker-entrypoint.sh"]
