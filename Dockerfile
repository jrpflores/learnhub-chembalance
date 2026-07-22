ARG NODE_IMAGE=node:20-slim
FROM ${NODE_IMAGE} AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY . .
RUN npm run setup
RUN npm run build

FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_FILE=/app/data/learnhub.db
ENV UPLOADS_DIR=/app/storage/uploads
ENV LOGS_DIR=/app/storage/logs
ENV AI_MODELS_DIR=/app/storage/models
ENV LEARNHUB_AUTO_SEED=false

RUN mkdir -p /tmp && chmod 1777 /tmp

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/db ./db
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/docker/entrypoint.sh /app/docker/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/docker/entrypoint.sh"]
