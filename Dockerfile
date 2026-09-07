# Orbis API + simulation worker (single free-tier web service)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @orbis/config --filter @orbis/contracts --filter @orbis/db --filter @orbis/api --filter @orbis/worker build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY --from=build /app /app
COPY scripts/start-backend.sh /app/scripts/start-backend.sh
RUN chmod +x /app/scripts/start-backend.sh
EXPOSE 4000
CMD ["/app/scripts/start-backend.sh"]
