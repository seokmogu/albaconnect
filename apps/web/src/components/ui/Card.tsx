import * as React from "react"
import { clsx } from "clsx"
import { Card as WxprCard, type CardProps as WxprCardProps } from "@wxpr/react"

export type CardVariant = "default" | "elevated" | "dark-surface"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  interactive?: boolean
  children: React.ReactNode
}

const variantMap: Record<CardVariant, WxprCardProps["variant"]> = {
  default: "outlined",
  elevated: "raised",
  "dark-surface": "default",
}

const variantClasses: Partial<Record<CardVariant, string>> = {
  "dark-surface": "bg-white/5 border border-white/10 text-white",
}

const interactiveClasses: Record<CardVariant, string> = {
  default: "hover:shadow-hover transition-shadow duration-200 cursor-pointer",
  elevated: "hover:shadow-hover transition-shadow duration-200 cursor-pointer",
  "dark-surface": "hover:bg-white/[0.08] transition-colors duration-200 cursor-pointer",
}

export function Card({ variant = "default", interactive = false, className, children, ...props }: CardProps) {
  return (
    <WxprCard
      className={clsx(variantClasses[variant], interactive && interactiveClasses[variant], className)}
      padding="large"
      variant={variantMap[variant]}
      {...props}
    >
      {children}
    </WxprCard>
  )
}
