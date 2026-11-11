# syntax=docker/dockerfile:1
FROM node:22-alpine AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY scripts/copy-vad-assets.mjs ./scripts/copy-vad-assets.mjs
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
# postinstall generates these; the host's ignored public/vad is never used.
COPY --from=dependencies /app/public/vad ./public/vad
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data \
    MOCK_DATA_DIR=/app/data NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S -g 10001 app && adduser -S -D -H -u 10001 -G app app \
    && mkdir -p /data && chown 10001:10001 /data && chmod 0700 /data
COPY --from=build --chown=10001:10001 /app/.next/standalone ./.next/standalone
COPY --from=build --chown=10001:10001 /app/.next/static ./.next/static
COPY --from=build --chown=10001:10001 /app/public ./public
COPY --from=build --chown=10001:10001 /app/data ./data
COPY --from=build --chown=10001:10001 /app/package.json ./package.json
COPY --from=build --chown=10001:10001 /app/scripts/start.mjs /app/scripts/healthcheck.mjs ./scripts/
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
    CMD ["node", "scripts/healthcheck.mjs"]
# Execute the exact npm start target directly so termination reaches Node.
# The verified standalone asset-copying startup wrapper is preserved.
CMD ["node", "--env-file-if-exists=.env", "scripts/start.mjs"]
