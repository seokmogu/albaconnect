import * as React from "react"
import { clsx } from "clsx"

export type BadgeVariant = "orange" | "emerald" | "slate" | "white-dim" | "error"

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  children: React.ReactNode
}

const variantClasses: Record<BadgeVariant, string> = {
  orange: "bg-primary/10 text-primary",
  emerald: "bg-accent/10 text-accent",
  slate: "bg-secondary/10 text-secondary-light",
  "white-dim": "bg-white/10 text-white/70",
  error: "bg-error/10 text-error",
}

export function Badge({ variant = "orange", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-pill px-3 py-1 text-xs font-semibold",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
