import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../utils/cn";
import "./Card.css";

export type CardPadding = "small" | "medium" | "large";
export type CardVariant = "default" | "outlined" | "raised";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
  variant?: CardVariant;
  children: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = "medium", variant = "default", className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "wxpr-card",
        `wxpr-card--${variant}`,
        `wxpr-card--p-${padding}`,
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});
