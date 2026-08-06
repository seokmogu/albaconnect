# @wxpr/icons

Phosphor icons (92 selected) × 5 weights as React components.

## Install

Workspace-internal — depend on it via `"@wxpr/icons": "workspace:*"`.

## Usage

### Named imports (preferred — tree-shakeable)

```tsx
import { User, MagnifyingGlass } from "@wxpr/icons";

<User size={24} weight="bold" />
<MagnifyingGlass size={16} color="var(--color-text-secondary)" />
```

### Dynamic by name

```tsx
import { Icon, type IconName } from "@wxpr/icons";

const name: IconName = "paper-plane-tilt";
<Icon name={name} size={20} weight="fill" />
```

## Props

All components accept:

| Prop | Type | Default |
|---|---|---|
| `size` | `number` | `24` |
| `weight` | `"thin" \| "light" \| "regular" \| "bold" \| "fill"` | `"regular"` |
| `color` | `string` | `"currentColor"` |
| ...rest | `SVGAttributes<SVGSVGElement>` | — |

## Regenerating from source

```bash
pnpm generate    # fetches 92 × 5 SVGs from phosphor-icons/core and emits src/icons/*.tsx
pnpm build       # tsup → dist/
```

Source: <https://github.com/phosphor-icons/core> (MIT). The exact 92-icon
allowlist lives in `scripts/generate.ts` and is mirrored in `src/types.ts`
as the `IconName` union — keep them in sync.
