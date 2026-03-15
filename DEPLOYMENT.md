# AlbaConnect — Production Deployment Guide (Fly.io)

## Overview

AlbaConnect deploys two Fly.io apps:

| App | Config | URL |
|---|---|---|
| `albaconnect-api` | `apps/api/fly.toml` | `https://albaconnect-api.fly.dev` |
| `albaconnect-web` | `apps/web/fly.toml` | `https://albaconnect-web.fly.dev` |

Both use **Tokyo (nrt)** as primary region — closest to the Korean market.

---

## Prerequisites

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Authenticate
fly auth login
```

---

## First-time Setup

### 1. Create Fly Apps

```bash
fly apps create albaconnect-api
fly apps create albaconnect-web
```

### 2. Create Fly Postgres (HA, 2 replicas)

```bash
fly postgres create \
  --name albaconnect-db \
  --region nrt \
  --initial-cluster-size 2 \
  --vm-size shared-cpu-1x \
  --volume-size 10

# Attach to API (auto-sets DATABASE_URL secret)
fly postgres attach albaconnect-db --app albaconnect-api
```

> **Note**: Fly Postgres runs as a Fly app. Enable daily snapshots:
> `fly postgres config update --snapshot-retention 7 -a albaconnect-db`

### 3. Set Up Redis (Upstash)

1. Create a free Redis database at [console.upstash.com](https://console.upstash.com)
2. Select region: `ap-northeast-1` (Tokyo)
3. Copy the `REDIS_URL` (TLS endpoint)

```bash
fly secrets set REDIS_URL="rediss://:<password>@<host>:6379" --app albaconnect-api
```

### 4. Set API Secrets

```bash
fly secrets set \
  JWT_SECRET="<strong-random-secret-min-32-chars>" \
  KAKAO_BIZ_API_KEY="<kakao-biz-api-key>" \
  TOSS_SECRET_KEY="<toss-secret-key>" \
  TOSS_WEBHOOK_SECRET="<toss-webhook-secret>" \
  VAPID_PRIVATE_KEY="<vapid-private-key>" \
  VAPID_PUBLIC_KEY="<vapid-public-key>" \
  VAPID_EMAIL="mailto:admin@albaconnect.kr" \
  ADMIN_TOKEN="<strong-admin-token>" \
  --app albaconnect-api
```

### 5. Set Web Secrets

```bash
fly secrets set \
  NEXT_PUBLIC_API_URL="https://albaconnect-api.fly.dev" \
  NEXT_PUBLIC_VAPID_PUBLIC_KEY="<vapid-public-key>" \
  NEXT_PUBLIC_KAKAO_MAP_API_KEY="<kakao-map-api-key>" \
  --app albaconnect-web
```

### 6. Add GitHub Secret

In your GitHub repo → Settings → Secrets → Actions:

```
FLY_API_TOKEN = <output of: fly tokens create deploy -a albaconnect-api>
```

> Create a single deploy token scoped to both apps or create one token per app.
> For multi-app token: `fly tokens create deploy` (no `-a` flag) for org-level token.

---

## Deploy

### Automatic (CI/CD)

Every push to `main` triggers `.github/workflows/deploy-prod.yml`:
1. API deploys first
2. Web deploys after API is healthy

### Manual

```bash
# From monorepo root
flyctl deploy --config apps/api/fly.toml --remote-only
flyctl deploy --config apps/web/fly.toml --remote-only
```

### Dry-run validation

```bash
flyctl deploy --config apps/api/fly.toml --local-only --build-only
flyctl deploy --config apps/web/fly.toml --local-only --build-only
```

---

## WebSocket (socket.io) — Multi-Instance Note

The API uses socket.io for real-time notifications. With a single Fly Machine (default), this works transparently. If you scale to 2+ machines:

```bash
fly scale count 2 --app albaconnect-api
```

You must enable sticky sessions to prevent socket.io reconnection loops. Add to `apps/api/fly.toml`:

```toml
[http_service]
  sticky_sessions = true
```

For true horizontal scale (3+ machines), migrate to Redis adapter:
```bash
pnpm add socket.io-redis --filter @albaconnect/api
```

---

## Scaling

```bash
# Scale machines
fly scale count 2 --app albaconnect-api

# Upgrade memory
fly scale memory 1024 --app albaconnect-api

# View current scale
fly scale show --app albaconnect-api
```

---

## Database Migrations

Migrations run automatically on API startup via `entrypoint.sh` (`node dist/db/migrate.js`).

To run manually:
```bash
fly ssh console --app albaconnect-api -C "node dist/db/migrate.js"
```

---

## Monitoring

```bash
# Live logs
fly logs --app albaconnect-api

# App status
fly status --app albaconnect-api
fly status --app albaconnect-web

# Machine details
fly machine list --app albaconnect-api
```

---

## Rollback

```bash
# List releases
fly releases --app albaconnect-api

# Roll back to previous release
fly deploy --image <image-from-previous-release> --app albaconnect-api
```

---

## Custom Domain

```bash
# Add domain
fly certs add albaconnect.kr --app albaconnect-web
fly certs add api.albaconnect.kr --app albaconnect-api

# Check certificate status
fly certs show albaconnect.kr --app albaconnect-web
```

Update DNS: add CNAME records pointing to `<app>.fly.dev`.

---

## Environment Variables Summary

| Variable | App | Description |
|---|---|---|
| `DATABASE_URL` | api | Auto-set by `fly postgres attach` |
| `REDIS_URL` | api | Upstash Redis TLS URL |
| `JWT_SECRET` | api | JWT signing secret (min 32 chars) |
| `KAKAO_BIZ_API_KEY` | api | Kakao Alim/Friend Talk API key |
| `TOSS_SECRET_KEY` | api | Toss Payments secret key |
| `TOSS_WEBHOOK_SECRET` | api | Toss webhook HMAC secret |
| `VAPID_PRIVATE_KEY` | api | Web Push VAPID private key |
| `VAPID_PUBLIC_KEY` | api | Web Push VAPID public key |
| `VAPID_EMAIL` | api | Web Push contact email |
| `ADMIN_TOKEN` | api | Admin endpoint bearer token |
| `NEXT_PUBLIC_API_URL` | web | Full URL of albaconnect-api |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | web | Web Push VAPID public key |
| `NEXT_PUBLIC_KAKAO_MAP_API_KEY` | web | Kakao Maps JS API key |
