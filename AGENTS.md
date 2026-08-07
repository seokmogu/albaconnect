# AGENTS.md — AlbaConnect

This file governs the entire `albaconnect/` repository. Follow it together with the workspace-level `/Users/seokmogu/project/AGENTS.md`; this file adds project-local constraints.

## Project Shape

AlbaConnect is a pnpm monorepo for a location-based short-term work matching platform.

- `apps/api/` — Fastify 5, TypeScript, Drizzle, PostgreSQL/PostGIS, Redis, Socket.io, Vitest.
- `apps/web/` — Next.js 15 App Router, React 19, Tailwind CSS 3, PWA pages for workers and employers.
- `packages/shared/` — shared TypeScript types/constants built before API/web tests.

Use `pnpm` only. Do not switch package managers or commit generated dependency churn unless the task is explicitly dependency-related.

## Commands

Run commands from the repository root unless a narrower package command is clearly enough.

```bash
pnpm install
pnpm run dev
pnpm run build
pnpm run typecheck
pnpm run test
```

Package-specific commands:

```bash
pnpm --filter @albaconnect/shared build
pnpm --filter @albaconnect/api test
pnpm --filter @albaconnect/api typecheck
pnpm --filter @albaconnect/web test
pnpm --filter @albaconnect/web typecheck
pnpm --filter @albaconnect/web dev
```

The root `test` script already builds `@albaconnect/shared` first, then runs API and web tests. Prefer the root script for cross-package behavior changes.

## Implementation Rules

- Keep changes small and scoped to the affected app/package.
- Reuse existing route/service/component patterns before adding new abstractions.
- Preserve strict TypeScript. Do not use `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Validate inputs with existing Zod/schema patterns at API boundaries.
- Keep API error responses compatible with existing route tests.
- Never log PII, resume/contact details, payment secrets, JWTs, OTPs, or raw webhook payload secrets.
- AI-generated or inferred user-facing results must be labeled `AI 추정`.
- Do not add dependencies without an explicit user request. If a dependency is unavoidable, document why existing packages cannot cover the use case.

## API And Data

- Treat database migrations as durable contracts. Read `apps/api/src/db/schema.ts` and existing migrations before changing schema.
- For payment, escrow, penalty, dispute, notification, and check-in flows, add or update targeted Vitest coverage.
- External integrations must default to test/dry-run paths. Never trigger real payments, notifications, or irreversible account actions from tests or ad hoc scripts.
- Redis and Socket.io behavior should degrade cleanly when optional infrastructure is unavailable in local/test environments.

## Frontend

- Prefer existing UI primitives in `apps/web/src/components/ui/` before creating page-local controls:
  - `Button`
  - `Card`
  - `FormField`
  - `Badge`
- Keep mobile-first ergonomics. The root layout currently constrains the main app shell to a mobile-width experience.
- Use Tailwind classes and the project tokens in `apps/web/tailwind.config.ts` / `apps/web/src/app/globals.css`.
- Use `lucide-react` for icons unless an adopted design-system icon package has already been added to this repo.
- Maintain Korean typography rules from `globals.css`: avoid awkward line breaks in Korean copy, keep labels concise, and test narrow mobile widths for overflow.
- Do not put nested cards inside cards. Cards are for repeated items, panels, and modals; page sections should stay simple and scannable.

## Design System

The local design language is Albamon-style orange/black/neutral tokens on top of Worxphere design-system primitives. Worxphere design-system runtime packages are vendored into this monorepo from `https://github.com/samko2717/Wxpr_Design_system`; see `docs/design-system-wxpr.md` for source commit and update policy.

Usage guidance:

- Use `@wxpr/tokens`, `@wxpr/icons`, and `@wxpr/react` from the local workspace packages under `packages/wxpr-*`.
- Keep `apps/web/src/app/globals.css` as the single import point for `@wxpr/tokens/css` and `@wxpr/react/styles`.
- Keep `apps/web/tailwind.config.ts` wired to `@wxpr/tokens/tailwind`.
- Do not replace existing AlbaConnect UI primitives wholesale without a migration pass and visual regression check.
- Preserve stable local import surfaces, and use Wxpr components/tokens with AlbaConnect's brand theme. Existing app-level aliases such as `primary` and `secondary` are intentionally mapped to Albamon orange and dark neutral tokens, not upstream Wxpr navy/blue.
- When updating Wxpr packages, record the upstream source commit in `docs/design-system-wxpr.md`.

## Testing And Verification

Match verification to risk:

- Docs-only: read the changed file and check links/commands for obvious accuracy.
- Web UI: run `pnpm --filter @albaconnect/web typecheck` and targeted tests; use a local browser check for visual changes.
- API/service logic: run targeted Vitest files plus `pnpm --filter @albaconnect/api typecheck`.
- Cross-package contracts: run `pnpm run typecheck` and `pnpm run test`.
- Production/deploy changes: also review `DEPLOYMENT.md`, `POC_DEPLOYMENT.md`, and relevant `.env.example` files.

Before claiming completion, report what changed, which commands were run, and any verification gaps.
