import {
  createContext,
  forwardRef,
  useContext,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "@wxpr/icons";
import { cn } from "../../utils/cn";
import "./Tab.css";

interface TabGroupContextValue {
  value: string;
  setValue: (v: string) => void;
}

const TabGroupContext = createContext<TabGroupContextValue | null>(null);

export interface TabGroupProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}

export const TabGroup = forwardRef<HTMLDivElement, TabGroupProps>(
  function TabGroup({ value, onValueChange, className, children, ...rest }, ref) {
    return (
      <TabGroupContext.Provider value={{ value, setValue: onValueChange }}>
        <div
          ref={ref}
          role="tablist"
          className={cn("wxpr-tab-group", className)}
          {...rest}
        >
          {children}
        </div>
      </TabGroupContext.Provider>
    );
  },
);

export interface TabProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  /** Required when used inside a TabGroup. */
  value?: string;
  /** Force-active even outside a TabGroup. */
  active?: boolean;
  icon?: IconName;
  children?: ReactNode;
}

export const Tab = forwardRef<HTMLButtonElement, TabProps>(function Tab(
  {
    value,
    active: activeProp,
    icon,
    children,
    onClick,
    className,
    type = "button",
    ...rest
  },
  ref,
) {
  const ctx = useContext(TabGroupContext);
  const active =
    activeProp ?? (ctx && value !== undefined ? ctx.value === value : false);
  return (
    <button
      ref={ref}
      type={type}
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      className={cn("wxpr-tab", active && "wxpr-tab--active", className)}
      onClick={(e) => {
        if (ctx && value !== undefined) ctx.setValue(value);
        onClick?.(e);
      }}
      {...rest}
    >
      {icon && (
        <Icon name={icon} size={16} aria-hidden="true" className="wxpr-tab__icon" />
      )}
      {children && <span>{children}</span>}
    </button>
  );
});
