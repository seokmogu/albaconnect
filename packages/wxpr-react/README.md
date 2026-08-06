# @wxpr/react

Worxphere React component library. All components style themselves via
`@wxpr/tokens` CSS variables, so light/dark theme switching is just a root
attribute toggle (`<html data-theme="dark">`).

## Install

Workspace-internal. From a consuming app:

```tsx
import "@wxpr/tokens/css";   // design token CSS variables
import "@wxpr/react/styles"; // component CSS
import { Button, Input, Modal } from "@wxpr/react";
```

## Components

| Component | Variants / size | Notes |
|---|---|---|
| `Button` | `primary` \| `secondary` \| `tertiary` \| `ghost` \| `danger` × `small/medium/large` | `leadingIcon`, `trailingIcon`, `loading`, `fullWidth` |
| `IconButton` | `primary` \| `secondary` \| `tertiary` \| `ghost` × `x-small/small/medium/large` | `aria-label` required |
| `Input` | `small/medium/large` | `label`, `helperText`, `errorMessage`, `leadingIcon` |
| `Card` | `default` \| `outlined` \| `raised` × `small/medium/large` padding | Pure layout container |
| `Badge` | `neutral` \| `brand` \| `success` \| `danger` \| `warning` \| `info` × `small/medium` | `icon` optional |
| `Tab` + `TabGroup` | — | Controlled via `value` / `onValueChange` |
| `Modal` | `default` \| `confirmation` \| `destructive` × `small/medium/large/x-large` | Renders to `document.body` portal; ESC + backdrop close; focus restore |
| `Toast` | `info` \| `success` \| `warning` \| `danger` × `top` / `bottom` | Optional `actionLabel`, auto-dismiss via `duration` |
| `Dropdown` + `DropdownItem` | `small/medium/large` | Click-outside + ESC close, single-select |

## Build

```bash
pnpm typecheck
pnpm build       # tsup → dist/ (index.js + index.css + index.d.ts)
```

See the live catalog in `apps/storybook`.
