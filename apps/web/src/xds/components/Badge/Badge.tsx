import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/xds/lib/utils";

const badgeVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-1 rounded-brand-xs px-2 font-sans font-medium",
    "select-none whitespace-nowrap",
  ),
  {
    variants: {
      // 아이콘 색은 color마다 명시 (AGENTS §11). gray/white는 Figma 정합으로
      // 텍스트(secondary=gray-800)와 아이콘(inverse=gray-950) 톤 분리.
      color: {
        brand: "bg-fill-element-brand-subtle text-typography-brand [&_svg]:icon-brand",
        blue: "bg-fill-element-info-subtle text-typography-info [&_svg]:icon-info",
        purple:
          "bg-fill-element-accent-violet-subtle text-typography-accent-violet [&_svg]:icon-accent-violet",
        green: "bg-fill-element-success-subtle text-typography-success [&_svg]:icon-success",
        yellow: "bg-fill-element-warning-subtle text-typography-warning [&_svg]:icon-warning",
        gray: "bg-fill-element-surface text-typography-secondary [&_svg]:icon-inverse",
        red: "bg-fill-element-danger-subtle text-typography-error [&_svg]:icon-danger",
        white:
          "bg-fill-element text-typography-secondary [&_svg]:icon-inverse border border-border",
      },
      size: {
        // 아이콘 크기는 자식 SVG에 [&_svg]:size-* 부여 (md=16, sm=14)
        md: "h-8 py-1 text-body-xs leading-20 [&_svg]:size-4",
        sm: "h-6 px-1.5 py-0.5 text-caption-base leading-18 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { color: "brand", size: "md" },
  },
);

export type BadgeVariants = VariantProps<typeof badgeVariants>;
export type BadgeProps = Omit<React.ComponentProps<"span">, "color"> &
  BadgeVariants & {
    /** 텍스트 좌측 아이콘 슬롯 (Figma `iconLeading` boolean과 1:1). 색은 color variant의 [&_svg]:icon-* 토큰이 강제 (AGENTS §11) */
    iconLeading?: React.ReactNode;
    /** 텍스트 우측 아이콘 슬롯 (Figma `iconTrailing` boolean과 1:1). 색은 color variant의 [&_svg]:icon-* 토큰이 강제 (AGENTS §11) */
    iconTrailing?: React.ReactNode;
  };

export function Badge({
  className,
  color,
  size,
  iconLeading,
  iconTrailing,
  children,
  ...props
}: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ color, size }), className)} {...props}>
      {iconLeading}
      {children}
      {iconTrailing}
    </span>
  );
}

Badge.variants = badgeVariants;
