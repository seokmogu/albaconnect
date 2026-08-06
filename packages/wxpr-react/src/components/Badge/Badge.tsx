import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "@wxpr/icons";
import { cn } from "../../utils/cn";
import "./Badge.css";

export type BadgeSize = "small" | "medium";
export type BadgeVariant =
  | "neutral"
  | "brand"
  | "success"
  | "danger"
  | "warning"
  | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  size?: BadgeSize;
  variant?: BadgeVariant;
  icon?: IconName;
  children: ReactNode;
}

const ICON_PX: Record<BadgeSize, number> = { small: 12, medium: 14 };

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { size = "medium", variant = "neutral", icon, className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        "wxpr-badge",
        `wxpr-badge--${variant}`,
        `wxpr-badge--${size}`,
        className,
      )}
      {...rest}
    >
      {icon && (
        <Icon
          name={icon}
          size={ICON_PX[size]}
          aria-hidden="true"
          className="wxpr-badge__icon"
        />
      )}
      <span>{children}</span>
    </span>
  );
});
