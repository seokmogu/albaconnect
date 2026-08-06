import { forwardRef } from "react";
import * as Icons from "./icons";
import type { IconName, IconProps } from "./types";

function toPascal(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export interface NamedIconProps extends IconProps {
  name: IconName;
}

/**
 * Dynamic icon selector. Prefer named imports (e.g. `<User />`) for tree-shaking
 * when the icon set is known at build time. Use `<Icon name="..." />` only when
 * the icon name is dynamic at runtime.
 */
export const Icon = forwardRef<SVGSVGElement, NamedIconProps>(function Icon(
  { name, ...rest },
  ref,
) {
  const Component = (Icons as Record<string, React.ComponentType<IconProps & { ref?: React.Ref<SVGSVGElement> }>>)[
    toPascal(name)
  ];
  if (!Component) {
    if (typeof console !== "undefined") {
      console.warn(`[@wxpr/icons] Unknown icon name: "${name}"`);
    }
    return null;
  }
  return <Component ref={ref} {...rest} />;
});
Icon.displayName = "Icon";
