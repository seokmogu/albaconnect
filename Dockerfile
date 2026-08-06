FROM public.ecr.aws/docker/library/node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

ARG NEXT_PUBLIC_API_URL=https://albaconnect.dev.jobko.io
ARG NEXT_PUBLIC_SITE_URL=https://albaconnect.dev.jobko.io
ARG NEXT_PUBLIC_KAKAO_MAP_API_KEY=
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=
ARG NEXT_PUBLIC_SENTRY_DSN=

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_KAKAO_MAP_API_KEY=$NEXT_PUBLIC_KAKAO_MAP_API_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/

RUN pnpm install --frozen-lockfile --filter @albaconnect/web...
RUN pnpm --filter @albaconnect/shared run build
RUN pnpm --filter @albaconnect/web run build

FROM public.ecr.aws/docker/library/node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
ENV HOME=/home/node

COPY --from=builder --chown=1000:1000 /app/apps/web/.next/standalone ./
COPY --from=builder --chown=1000:1000 /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=1000:1000 /app/apps/web/public ./apps/web/public
COPY --chown=1000:1000 sim/data ./sim/data

USER 1000:1000
EXPOSE 8080

CMD ["node", "apps/web/server.js"]
