import * as React from "react"
import { clsx } from "clsx"
import { Badge as WxprBadge, type BadgeProps as WxprBadgeProps } from "@wxpr/react"

export type BadgeVariant = "orange" | "emerald" | "slate" | "white-dim" | "error"

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  children: React.ReactNode
}

const variantMap: Record<BadgeVariant, WxprBadgeProps["variant"]> = {
  orange: "brand",
  emerald: "success",
  slate: "neutral",
  "white-dim": "neutral",
  error: "danger",
}

const variantClasses: Partial<Record<BadgeVariant, string>> = {
  "white-dim": "bg-white/10 text-white/70",
}

export function Badge({ variant = "orange", className, children, ...props }: BadgeProps) {
  return (
    <WxprBadge
      className={clsx(variantClasses[variant], className)}
      variant={variantMap[variant]}
      {...props}
    >
      {children}
    </WxprBadge>
  )
}
