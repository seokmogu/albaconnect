/**
 * /sim layout — escapes the root body's max-w-md PWA constraint.
 * All sim dashboards need full desktop width.
 */
import type React from "react"

export default function SimLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen overflow-x-hidden">
      {children}
    </div>
  )
}
