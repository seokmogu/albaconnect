import * as React from "react"
import { clsx } from "clsx"

interface FormFieldProps {
  id: string
  label: string
  error?: string
  required?: boolean
  children: React.ReactElement<React.InputHTMLAttributes<HTMLInputElement> | React.SelectHTMLAttributes<HTMLSelectElement>>
}

export function FormField({ id, label, error, required, children }: FormFieldProps) {
  const child = React.cloneElement(children, {
    id,
    "aria-describedby": error ? `${id}-error` : undefined,
    "aria-invalid": error ? "true" : undefined,
    className: clsx(
      "w-full border rounded-md px-4 py-3 text-base text-secondary bg-white",
      "placeholder:text-slate-400 transition-colors duration-150",
      "focus:outline-none focus:ring-2 focus:border-transparent",
      error
        ? "border-error focus:ring-error"
        : "border-[#E2E8F0] focus:ring-primary",
      "disabled:bg-surface disabled:text-slate-400 disabled:cursor-not-allowed",
      (children.props as { className?: string }).className,
    ),
  } as React.HTMLAttributes<HTMLElement>)

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-secondary">
        {label}
        {required && <span className="text-error ml-1" aria-hidden="true">*</span>}
      </label>
      {child}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          aria-live="polite"
          className="text-sm text-error mt-1 flex items-center gap-1"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </p>
      )}
    </div>
  )
}
