# Wxpr Design System Integration

Purpose: record how AlbaConnect consumes the Worxphere design system without nesting the external git repository inside this repository.

## Source

- Repository: https://github.com/samko2717/Wxpr_Design_system
- Imported commit: `e041a0d5afb96f96748988f2f5bf717c958fe584`
- Imported packages:
  - `packages/wxpr-tokens` as `@wxpr/tokens`
  - `packages/wxpr-icons` as `@wxpr/icons`
  - `packages/wxpr-react` as `@wxpr/react`

## Local Integration

`apps/web` imports the runtime CSS once from the root stylesheet:

```css
@import "@wxpr/tokens/css";
@import "@wxpr/react/styles";
```

`apps/web/tailwind.config.ts` also loads the Wxpr Tailwind preset, so token-backed utilities such as `text-brand-primary`, `bg-surface-default`, and `rounded-medium` are available alongside AlbaConnect's existing utility names.

AlbaConnect uses Wxpr primitives and token contracts, but the product brand remains Albamon-style orange/black/neutral. Wxpr's upstream navy/blue action colors are overridden at the app token layer: existing `primary` usages resolve to AlbaConnect orange, while `secondary` resolves to dark neutral.

Existing page imports remain stable, but local primitives such as `apps/web/src/components/ui/Button.tsx`, `Badge.tsx`, and `Card.tsx` delegate to `@wxpr/react` components. Continue migrating primitives behind the local `components/ui/*` facade so page code does not need broad import churn.

## Update Policy

Do not clone the upstream repository into `albaconnect/`. To update Wxpr, fetch the upstream repository outside this repo, copy only the package directories needed at runtime, record the source commit here, then run:

```bash
pnpm install
pnpm run wxpr:build
pnpm --filter @albaconnect/web typecheck
```
