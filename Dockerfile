# syntax=docker/dockerfile:1

# --- Stage 1: build the React SPA -------------------------------------------
FROM node:24-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: runtime -------------------------------------------------------
# Runs the Hono server via tsx (resolves the @/* tsconfig path aliases that
# tsc does not rewrite). tsx is a runtime dependency, so --omit=dev keeps it.
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Server source + assets it needs at runtime (tsconfig for @/* alias resolution,
# drizzle/ for migrations run on startup).
COPY tsconfig.json drizzle.config.ts ./
COPY src/ ./src/
COPY drizzle/ ./drizzle/
COPY docker-entrypoint.sh ./

# serveStatic in src/index.ts reads ./frontend/dist relative to CWD (/app).
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

RUN chmod +x docker-entrypoint.sh \
	&& chown -R node:node /app
USER node

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
