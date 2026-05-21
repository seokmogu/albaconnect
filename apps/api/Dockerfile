FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/

RUN pnpm install --frozen-lockfile --filter @albaconnect/api...
RUN pnpm --filter @albaconnect/shared run build
RUN pnpm --filter @albaconnect/api run build

FROM node:22-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ packages/
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --prod --filter @albaconnect/api...

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY apps/api/src/db/migrations ./apps/api/src/db/migrations
COPY apps/api/entrypoint.sh ./apps/api/entrypoint.sh
RUN chmod +x apps/api/entrypoint.sh

WORKDIR /app/apps/api
USER node
EXPOSE 3001
ENTRYPOINT ["./entrypoint.sh"]
