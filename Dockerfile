# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres
ENV DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres

COPY package*.json ./

# Use `npm install` rather than `npm ci`: Railway's npm 10 rejected an older
# lockfile over a phantom TypeScript peer hint. Keep install independent from
# Prisma schema changes so dependency caching survives most app edits.
RUN --mount=type=cache,target=/root/.npm \
  npm install --include=dev --no-audit --no-fund --ignore-scripts

COPY patches ./patches
COPY prisma ./prisma
COPY prisma.config.ts ./

# Run only the postinstall work needed for this app. Doing it here avoids
# running Prisma generation during dependency install and again during build.
RUN npx patch-package && npx prisma generate

COPY . .

RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
