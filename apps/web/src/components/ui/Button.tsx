import * as React from "react"
import { clsx } from "clsx"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "link"
export type ButtonSize = "sm" | "md" | "lg"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  children: React.ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    "bg-primary text-white font-semibold rounded-md",
    "hover:bg-primary-dark",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    "active:scale-[0.98] transition-transform",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
  ].join(" "),
  secondary: [
    "bg-white border-2 border-primary text-primary font-semibold rounded-md",
    "hover:bg-primary/5",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    "active:scale-[0.98] transition-transform",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
  ghost: [
    "bg-transparent text-secondary-light font-medium rounded-md",
    "hover:bg-secondary/5 hover:text-secondary",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
    "disabled:opacity-40 disabled:cursor-not-allowed",
    "transition-colors",
  ].join(" "),
  link: [
    "text-primary font-medium underline underline-offset-4 bg-transparent",
    "hover:text-primary-dark",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm",
  ].join(" "),
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-base min-w-[120px]",
  lg: "h-[52px] px-8 text-lg min-w-[160px]",
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled ?? loading

  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 transition-colors",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={isDisabled}
      aria-busy={loading ? "true" : undefined}
      {...props}
    >
      {loading ? (
        <>
          <svg
            className="animate-spin"
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          신청 중...
        </>
      ) : (
        children
      )}
    </button>
  )
}
