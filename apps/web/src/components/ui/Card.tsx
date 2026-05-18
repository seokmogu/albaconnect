import * as React from "react"
import { clsx } from "clsx"

export type CardVariant = "default" | "elevated" | "dark-surface"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  interactive?: boolean
  children: React.ReactNode
}

const variantClasses: Record<CardVariant, string> = {
  default: "bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-card",
  elevated: "bg-white rounded-xl p-6 shadow-hover",
  "dark-surface": "bg-white/5 border border-white/10 rounded-xl p-6",
}

const interactiveClasses: Record<CardVariant, string> = {
  default: "hover:shadow-hover transition-shadow duration-200 cursor-pointer",
  elevated: "hover:shadow-hover transition-shadow duration-200 cursor-pointer",
  "dark-surface": "hover:bg-white/[0.08] transition-colors duration-200 cursor-pointer",
}

export function Card({ variant = "default", interactive = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={clsx(variantClasses[variant], interactive && interactiveClasses[variant], className)}
      {...props}
    >
      {children}
    </div>
  )
}
