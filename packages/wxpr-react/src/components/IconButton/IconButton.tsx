import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Icon, type IconName, type IconWeight } from "@wxpr/icons";
import { cn } from "../../utils/cn";
import "./IconButton.css";

export type IconButtonSize = "x-small" | "small" | "medium" | "large";
export type IconButtonVariant = "primary" | "secondary" | "tertiary" | "ghost";

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  icon: IconName;
  iconWeight?: IconWeight;
  "aria-label": string;
}

const SIZE_PX: Record<IconButtonSize, number> = {
  "x-small": 24,
  small: 32,
  medium: 40,
  large: 48,
};

const ICON_PX: Record<IconButtonSize, number> = {
  "x-small": 14,
  small: 18,
  medium: 20,
  large: 24,
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      size = "medium",
      variant = "ghost",
      icon,
      iconWeight = "regular",
      disabled,
      className,
      type = "button",
      style,
      ...rest
    },
    ref,
  ) {
    const px = SIZE_PX[size];
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={cn(
          "wxpr-icon-btn",
          `wxpr-icon-btn--${variant}`,
          `wxpr-icon-btn--${size}`,
          className,
        )}
        style={{ width: px, height: px, ...style }}
        {...rest}
      >
        <Icon
          name={icon}
          weight={iconWeight}
          size={ICON_PX[size]}
          aria-hidden="true"
        />
      </button>
    );
  },
);
