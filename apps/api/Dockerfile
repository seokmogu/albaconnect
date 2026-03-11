FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/

RUN pnpm install --frozen-lockfile --filter @albaconnect/api...
RUN pnpm --filter @albaconnect/api run build

FROM node:22-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ packages/
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --prod --filter @albaconnect/api...

COPY --from=builder /app/apps/api/dist ./dist
COPY apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

USER node
EXPOSE 3001
ENTRYPOINT ["./entrypoint.sh"]
