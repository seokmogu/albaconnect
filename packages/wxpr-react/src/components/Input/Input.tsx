import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "@wxpr/icons";
import { cn } from "../../utils/cn";
import "./Input.css";

export type InputSize = "small" | "medium" | "large";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: InputSize;
  label?: ReactNode;
  helperText?: ReactNode;
  errorMessage?: ReactNode;
  leadingIcon?: IconName;
  fullWidth?: boolean;
}

const ICON_PX: Record<InputSize, number> = {
  small: 14,
  medium: 16,
  large: 20,
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    size = "medium",
    label,
    helperText,
    errorMessage,
    leadingIcon,
    fullWidth = false,
    id,
    className,
    disabled,
    ...rest
  },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? `wxpr-input-${reactId}`;
  const describedById = errorMessage
    ? `${inputId}-error`
    : helperText
      ? `${inputId}-helper`
      : undefined;
  const isError = Boolean(errorMessage);
  return (
    <div
      className={cn(
        "wxpr-input-field",
        fullWidth && "wxpr-input-field--full",
        className,
      )}
    >
      {label && (
        <label htmlFor={inputId} className="wxpr-input__label">
          {label}
        </label>
      )}
      <div
        className={cn(
          "wxpr-input",
          `wxpr-input--${size}`,
          isError && "wxpr-input--error",
          disabled && "wxpr-input--disabled",
        )}
      >
        {leadingIcon && (
          <Icon
            name={leadingIcon}
            size={ICON_PX[size]}
            aria-hidden="true"
            className="wxpr-input__icon"
          />
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={isError || undefined}
          aria-describedby={describedById}
          className="wxpr-input__control"
          {...rest}
        />
      </div>
      {errorMessage ? (
        <p id={`${inputId}-error`} className="wxpr-input__message wxpr-input__message--error">
          {errorMessage}
        </p>
      ) : helperText ? (
        <p id={`${inputId}-helper`} className="wxpr-input__message">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});
