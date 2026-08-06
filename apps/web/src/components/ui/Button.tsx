import * as React from "react"
import { clsx } from "clsx"
import { Button as WxprButton, type ButtonProps as WxprButtonProps } from "@wxpr/react"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "link"
export type ButtonSize = "sm" | "md" | "lg"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  children: React.ReactNode
}

const variantMap: Record<ButtonVariant, WxprButtonProps["variant"]> = {
  primary: "primary",
  secondary: "secondary",
  ghost: "secondary",
  link: "ghost",
}

const sizeMap: Record<ButtonSize, WxprButtonProps["size"]> = {
  sm: "small",
  md: "medium",
  lg: "large",
}

const layoutClassPatterns = [
  /^(sm:|md:|lg:|xl:)?(w|min-w|max-w)-/,
  /^(sm:|md:|lg:|xl:)?(m|mt|mr|mb|ml|mx|my)-/,
  /^(sm:|md:|lg:|xl:)?(self|shrink|grow|basis)-/,
  /^(sm:|md:|lg:|xl:)?(hidden|block|inline-block|inline-flex|flex)$/,
]

function keepLayoutClasses(className?: string) {
  if (!className) return undefined
  const kept = className
    .split(/\s+/)
    .filter((token) => layoutClassPatterns.some((pattern) => pattern.test(token)))
    .join(" ")
  return kept || undefined
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
    <WxprButton
      className={clsx(variant === "link" && "underline underline-offset-4", keepLayoutClasses(className))}
      disabled={isDisabled}
      loading={loading}
      size={sizeMap[size]}
      variant={variantMap[variant]}
      {...props}
    >
      {loading ? "신청 중..." : children}
    </WxprButton>
  )
}
