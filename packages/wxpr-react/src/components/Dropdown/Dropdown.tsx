import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  Children,
  isValidElement,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "@wxpr/icons";
import { cn } from "../../utils/cn";
import "./Dropdown.css";

export type DropdownSize = "small" | "medium" | "large";

interface DropdownContextValue {
  value: string | undefined;
  setValue: (v: string) => void;
  close: () => void;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

export interface DropdownItemProps {
  value: string;
  icon?: IconName;
  disabled?: boolean;
  children: ReactNode;
}

export function DropdownItem({
  value,
  icon,
  disabled = false,
  children,
}: DropdownItemProps) {
  const ctx = useContext(DropdownContext);
  if (!ctx) {
    throw new Error("DropdownItem must be rendered inside a Dropdown.");
  }
  const selected = ctx.value === value;
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled}
      className={cn(
        "wxpr-dropdown__item",
        selected && "wxpr-dropdown__item--selected",
        disabled && "wxpr-dropdown__item--disabled",
      )}
      onClick={() => {
        if (disabled) return;
        ctx.setValue(value);
        ctx.close();
      }}
    >
      {icon && (
        <Icon name={icon} size={16} aria-hidden="true" className="wxpr-dropdown__item-icon" />
      )}
      <span className="wxpr-dropdown__item-label">{children}</span>
      {selected && (
        <Icon name="check" size={16} aria-hidden="true" className="wxpr-dropdown__item-check" />
      )}
    </button>
  );
}

export interface DropdownProps {
  size?: DropdownSize;
  placeholder?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
}

export function Dropdown({
  size = "medium",
  placeholder = "Select…",
  value,
  onValueChange,
  disabled = false,
  children,
  className,
  fullWidth = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const listboxId = `wxpr-dd-${reactId}`;

  // Outside-click + ESC close
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Find label for currently selected item by walking children
  const selectedLabel = useMemo<ReactNode>(() => {
    if (value === undefined) return undefined;
    let label: ReactNode = undefined;
    Children.forEach(children, (child) => {
      if (
        isValidElement<DropdownItemProps>(child) &&
        child.props.value === value
      ) {
        label = child.props.children;
      }
    });
    return label;
  }, [children, value]);

  const ctx: DropdownContextValue = {
    value,
    setValue: (v) => onValueChange?.(v),
    close: () => setOpen(false),
  };

  return (
    <DropdownContext.Provider value={ctx}>
      <div
        ref={rootRef}
        className={cn(
          "wxpr-dropdown",
          fullWidth && "wxpr-dropdown--full",
          className,
        )}
      >
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          disabled={disabled}
          className={cn(
            "wxpr-dropdown__trigger",
            `wxpr-dropdown__trigger--${size}`,
            !selectedLabel && "wxpr-dropdown__trigger--placeholder",
          )}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="wxpr-dropdown__trigger-label">
            {selectedLabel ?? placeholder}
          </span>
          <Icon
            name={open ? "caret-up" : "caret-down"}
            size={16}
            aria-hidden="true"
            className="wxpr-dropdown__trigger-caret"
          />
        </button>
        {open && (
          <ul
            id={listboxId}
            role="listbox"
            className="wxpr-dropdown__list"
          >
            {children}
          </ul>
        )}
      </div>
    </DropdownContext.Provider>
  );
}
