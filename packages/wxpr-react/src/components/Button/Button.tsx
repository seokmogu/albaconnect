import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "@wxpr/icons";
import { cn } from "../../utils/cn";
import "./Button.css";

export type ButtonSize = "small" | "medium" | "large";
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "ghost"
  | "danger";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize;
  variant?: ButtonVariant;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

const ICON_SIZE: Record<ButtonSize, number> = {
  small: 16,
  medium: 18,
  large: 20,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      size = "medium",
      variant = "primary",
      leadingIcon,
      trailingIcon,
      loading = false,
      fullWidth = false,
      disabled,
      className,
      children,
      type = "button",
      ...rest
    },
    ref,
  ) {
    const iconSize = ICON_SIZE[size];
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(
          "wxpr-btn",
          `wxpr-btn--${variant}`,
          `wxpr-btn--${size}`,
          fullWidth && "wxpr-btn--full",
          loading && "wxpr-btn--loading",
          className,
        )}
        {...rest}
      >
        {loading ? (
          <span className="wxpr-btn__spinner" aria-hidden="true" />
        ) : (
          leadingIcon && (
            <Icon
              name={leadingIcon}
              size={iconSize}
              aria-hidden="true"
              className="wxpr-btn__icon"
            />
          )
        )}
        <span className="wxpr-btn__label">{children}</span>
        {trailingIcon && !loading && (
          <Icon
            name={trailingIcon}
            size={iconSize}
            aria-hidden="true"
            className="wxpr-btn__icon"
          />
        )}
      </button>
    );
  },
);
