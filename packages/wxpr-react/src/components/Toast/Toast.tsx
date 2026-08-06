import { useEffect, type ReactNode } from "react";
import { Icon, type IconName } from "@wxpr/icons";
import { IconButton } from "../IconButton";
import { cn } from "../../utils/cn";
import "./Toast.css";

export type ToastType = "info" | "success" | "warning" | "danger";
export type ToastPosition = "top" | "bottom";

export interface ToastProps {
  type?: ToastType;
  position?: ToastPosition;
  message: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
  /** Auto-dismiss after `duration` ms. 0 disables auto-dismiss. Default 5000. */
  duration?: number;
}

const TYPE_ICON: Record<ToastType, IconName> = {
  info: "info",
  success: "check-circle",
  warning: "warning",
  danger: "x-circle",
};

export function Toast({
  type = "info",
  position = "top",
  message,
  actionLabel,
  onAction,
  onClose,
  duration = 5000,
}: ToastProps) {
  useEffect(() => {
    if (!duration || !onClose) return;
    const id = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(id);
  }, [duration, onClose]);

  return (
    <div
      role={type === "danger" || type === "warning" ? "alert" : "status"}
      aria-live={type === "danger" || type === "warning" ? "assertive" : "polite"}
      className={cn(
        "wxpr-toast",
        `wxpr-toast--${type}`,
        `wxpr-toast--${position}`,
      )}
    >
      <span className={cn("wxpr-toast__bar", `wxpr-toast__bar--${type}`)} aria-hidden="true" />
      <Icon
        name={TYPE_ICON[type]}
        weight="fill"
        size={20}
        className={cn("wxpr-toast__icon", `wxpr-toast__icon--${type}`)}
        aria-hidden="true"
      />
      <span className="wxpr-toast__message">{message}</span>
      {actionLabel && (
        <button type="button" className="wxpr-toast__action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
      {onClose && (
        <IconButton
          icon="x"
          variant="ghost"
          size="x-small"
          aria-label="Dismiss notification"
          onClick={onClose}
          className="wxpr-toast__close"
        />
      )}
    </div>
  );
}
