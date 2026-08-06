# XDS Integration for AlbaConnect

AlbaConnect's worker and employer web surfaces use the company-wide XDS registry with the Albamon brand theme. This is the primary product UI system; the vendored Wxpr packages remain available for legacy and admin surfaces during migration.

## Verified source

- Internal repository: `https://git.jobkorea.co.kr/design/xds.git`
- Verified commit: `aa66127713d8d0cacac33878f945520209d963f3`
- Verified on: 2026-08-06
- Registry release: `registry-v13`
- Brand selector: `<html data-brand="am">`

The source commit was checked against the internal GitLab remote before onboarding. XDS defines the Albamon primary token as `--primitive-amorange-500: #ff6d12` and provides brand-aware radii, typography, semantic colors, components, and icons.

## Local integration

The XDS CLI copies versioned source files into `apps/web/src/xds/` and records their hashes in `apps/web/xds.lock.json`. Do not edit generated XDS files directly.

The web app wires XDS at three points:

1. `apps/web/src/app/globals.css` imports `xds-tokens.css` once.
2. `apps/web/tailwind.config.ts` loads `xds.preset.cjs` alongside the legacy Wxpr preset.
3. `apps/web/src/app/layout.tsx` applies `data-brand="am"` and the XDS `ThemeProvider`.

Use semantic utilities such as `bg-background`, `text-typography-secondary`, `border-border`, and `rounded-brand-md`. Do not use primitive color tokens in product pages.

## Registry updates

The registry URL in `apps/web/xds.json` uses `XDS_GITLAB_TOKEN` at execution time. To check or update source-vendored components, run the internal CLI documented by `design/xds/plugin/skills/` and review conflicts before accepting generated changes.

For every product screen migration:

- cover loading, empty, error, and populated states;
- keep mobile touch targets at least 40px;
- label inferred matching output as `AI 추정`;
- run web typecheck, targeted tests, and a narrow viewport browser check.
