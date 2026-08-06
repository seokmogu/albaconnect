import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/xds/lib/utils";

const buttonVariants = cva(
  cn(
    "relative isolate inline-flex items-center justify-center font-sans",
    "select-none whitespace-nowrap transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
    // hover overlay (Figma의 fill-element-hover-weak를 ::after로 위에 덧씌움)
    "after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none",
    "after:bg-fill-element-hover-weak after:opacity-0 after:transition-opacity",
    "hover:after:opacity-100",
    // disabled 공통 override (아이콘도 함께 — AGENTS §11 부모 상속 의존 금지)
    "disabled:cursor-not-allowed disabled:after:opacity-0",
    "disabled:bg-fill-element-disabled-weak disabled:text-typography-disabled disabled:[&_svg]:icon-disabled",
  ),
  {
    variants: {
      // 아이콘 색은 variant마다 명시 (AGENTS §11). gray-950 텍스트 = icon-inverse(=gray-950).
      variant: {
        primary: "bg-fill-element-brand text-typography-static-white [&_svg]:icon-static-white",
        secondary: "bg-fill-element-brand-subtle text-typography-brand [&_svg]:icon-brand",
        tertiary: "bg-fill-element-surface text-typography [&_svg]:icon-inverse",
        outlineSecondary:
          "border border-border bg-transparent text-typography-brand [&_svg]:icon-brand disabled:border-border-disabled",
        outlineTertiary:
          "border border-border bg-transparent text-typography [&_svg]:icon-inverse disabled:border-border-disabled",
      },
      size: {
        lg: "min-w-[72px] h-[52px] gap-1 rounded-brand-md px-4 text-body-base font-semibold leading-24 [&_svg]:size-5",
        md: "min-w-[72px] h-12 gap-1 rounded-brand-md px-4 text-body-base font-semibold leading-24 [&_svg]:size-5",
        sm: "min-w-[68px] h-10 gap-1 rounded-brand-md px-4 text-body-xs font-semibold leading-20 [&_svg]:size-4",
        xs: "min-w-[64px] h-8 gap-1 rounded-brand-sm px-3 text-caption-lg font-medium leading-20 [&_svg]:size-4",
        xxs: "min-w-[58px] h-7 gap-1 rounded-brand-sm px-3 text-caption-lg font-medium leading-20 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
export type ButtonProps = React.ComponentProps<"button"> &
  ButtonVariants & {
    /** 텍스트 좌측 아이콘 슬롯 (Figma `iconLeading` boolean과 1:1) */
    iconLeading?: React.ReactNode;
    /** 텍스트 우측 아이콘 슬롯 (Figma `iconTrailing` boolean과 1:1) */
    iconTrailing?: React.ReactNode;
  };

export function Button({
  className,
  variant,
  size,
  type = "button",
  iconLeading,
  iconTrailing,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      data-slot="button"
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {iconLeading}
      {children}
      {iconTrailing}
    </button>
  );
}

Button.variants = buttonVariants;
