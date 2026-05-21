# AlbaConnect Internal POC Deployment

This guide is for a company-network-only POC on a Mac mini or similar single host. It is intentionally simpler than the Fly.io production guide.

## What This Runs

- Web: Next.js on `WEB_PORT`, default `3000`
- API: Fastify + Socket.IO on `API_PORT`, default `3001`
- Database: PostgreSQL 16 + PostGIS
- Redis: OTP, cache, and shared runtime state
- Toss: mock client by default, no public webhook required

## Network Assumption

Use a LAN hostname or fixed internal IP that every tester can reach, for example:

```text
http://macmini.local:3000
http://macmini.local:3001
```

Do not use `localhost` in `POC_WEB_PUBLIC_URL` or `POC_API_PUBLIC_URL` when other employees will access the service. Their browsers would resolve `localhost` to their own laptops.

## First Run

```bash
pnpm poc:setup -- --host macmini.local
pnpm poc:doctor
pnpm poc:up
pnpm poc:ps
```

If `.local` hostnames are unreliable on your network, use the Mac mini's fixed LAN IP:

```bash
pnpm poc:setup -- --host 192.168.0.25 --force
pnpm poc:doctor
pnpm poc:up
```

The setup command writes `.env.poc` with generated POC secrets and URLs such as:

```env
POC_WEB_PUBLIC_URL=http://macmini.local:3000
POC_API_PUBLIC_URL=http://macmini.local:3001
```

Manual Compose commands are still available:

```bash
docker compose --env-file .env.poc -f docker-compose.poc.yml up -d --build
docker compose --env-file .env.poc -f docker-compose.poc.yml ps
```

Health checks:

```bash
pnpm poc:health
```

Logs:

```bash
pnpm poc:logs
pnpm poc:logs api
pnpm poc:logs web
```

## Mac Mini Host Notes

- Install Docker Desktop, OrbStack, or Colima before running `pnpm poc:doctor`.
- Keep the Mac mini awake while testing: disable sleep for the POC window or keep it on power with wake-for-network enabled.
- Allow inbound connections to ports `3000` and `3001` in the macOS firewall if prompted.
- The POC compose file exposes Web/API to the LAN, but binds Postgres and Redis to `127.0.0.1` by default.
- Keep Docker configured to start at login if the POC should survive Mac mini reboots. The Compose services use `restart: unless-stopped`.

## POC Payment Behavior

The POC profile uses:

```env
TOSS_CLIENT_MODE=mock
TOSS_MOCK_PAYMENT_STATUS=DONE
PAYOUT_RELEASE_MODE=manual
```

This lets the escrow flow run without Toss live credentials or a public webhook endpoint. If you switch to real Toss payments, the API callback URL must be reachable by Toss from the public internet, which an internal-only Mac mini normally is not. Use the Fly.io production deployment or an approved tunnel only for that test.

## Optional Integrations

For a closed internal POC, these can be blank:

- `KAKAO_BIZ_API_KEY`, `KAKAO_SENDER_KEY`: AlimTalk falls back to logs.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: Web Push is disabled when unset.
- `SENTRY_DSN`: error tracking is disabled when unset.

Kakao Maps needs `NEXT_PUBLIC_KAKAO_MAP_API_KEY` if testers need the actual map UI.

## Data Backup

Create a manual DB backup:

```bash
pnpm poc:backup
```

Restore:

```bash
pnpm poc:restore -- backups/albaconnect-poc.sql
```

## Stop / Reset

Stop services:

```bash
pnpm poc:down
```

Delete POC data:

```bash
pnpm poc:reset-data
```

## Limits

- This is a single-host POC profile, not a high-availability production topology.
- API background workers run inside the API container. Do not scale `api` replicas in this profile.
- Web Push requires a secure browser context for real browser delivery. For HTTP-only internal POC, treat push as optional unless you set up trusted internal TLS.
