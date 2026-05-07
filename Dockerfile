FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres
ENV DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Use `npm install` rather than `npm ci`: Railway's npm 10 rejects our lockfile
# (regenerated with npm 11) over a phantom typescript@5.9.3 peer hint that no
# package actually pins. `npm install` reconciles the drift instead of erroring.
RUN npm install --include=dev --no-audit --no-fund

COPY . .

RUN npx prisma generate && npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
