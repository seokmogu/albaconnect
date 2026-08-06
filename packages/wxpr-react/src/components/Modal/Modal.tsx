import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "../IconButton";
import { Button, type ButtonVariant } from "../Button";
import { cn } from "../../utils/cn";
import "./Modal.css";

export type ModalSize = "small" | "medium" | "large" | "x-large";
export type ModalVariant = "default" | "confirmation" | "destructive";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  size?: ModalSize;
  variant?: ModalVariant;
  title?: ReactNode;
  description?: ReactNode;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  cancelLabel?: string;
  showCancel?: boolean;
  children?: ReactNode;
  /** Override the close button's accessible label. */
  closeLabel?: string;
}

const PRIMARY_VARIANT: Record<ModalVariant, ButtonVariant> = {
  default: "primary",
  confirmation: "primary",
  destructive: "danger",
};

export function Modal({
  open,
  onClose,
  size = "medium",
  variant = "default",
  title,
  description,
  primaryActionLabel,
  onPrimaryAction,
  cancelLabel = "Cancel",
  showCancel = true,
  children,
  closeLabel = "Close dialog",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // ESC to close + scroll lock + focus restore
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus dialog on open
    requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const hasFooter = Boolean(primaryActionLabel || showCancel);

  const node = (
    <div
      className="wxpr-modal__backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "wxpr-modal-title" : undefined}
        aria-describedby={description ? "wxpr-modal-desc" : undefined}
        tabIndex={-1}
        className={cn("wxpr-modal", `wxpr-modal--${size}`)}
      >
        <div className="wxpr-modal__header">
          {title && (
            <h2 id="wxpr-modal-title" className="wxpr-modal__title">
              {title}
            </h2>
          )}
          <IconButton
            icon="x"
            variant="ghost"
            size="small"
            aria-label={closeLabel}
            onClick={onClose}
            className="wxpr-modal__close"
          />
        </div>
        {description && (
          <p id="wxpr-modal-desc" className="wxpr-modal__description">
            {description}
          </p>
        )}
        {children && <div className="wxpr-modal__body">{children}</div>}
        {hasFooter && (
          <div className="wxpr-modal__footer">
            {showCancel && (
              <Button variant="secondary" onClick={onClose}>
                {cancelLabel}
              </Button>
            )}
            {primaryActionLabel && (
              <Button
                variant={PRIMARY_VARIANT[variant]}
                onClick={() => {
                  onPrimaryAction?.();
                }}
              >
                {primaryActionLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
