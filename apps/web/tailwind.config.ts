import type { Config } from "tailwindcss"
import { createRequire } from "node:module"
import wxprPreset from "@wxpr/tokens/tailwind"

const require = createRequire(import.meta.url)
const xdsPreset = require("./src/xds/styles/xds.preset.cjs")

const config: Config = {
  presets: [wxprPreset, xdsPreset],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: ["selector", ".dark"],
  theme: {
    extend: {
      colors: {
        // Wxpr-backed app aliases retained for existing screens,
        // themed to AlbaConnect's Albamon-style orange brand.
        primary: {
          DEFAULT: "#FF6E0D",
          light: "#FF8A3D",
          dark: "#E55E00",
          50: "#FFF7ED",
          100: "#FFE8D6",
          500: "#FF6E0D",
          600: "#E55E00",
          700: "#B94A00",
        },
        secondary: {
          DEFAULT: "#182432",
          light: "#4E5968",
          dark: "#0A0F16",
        },
        accent: {
          DEFAULT: "#10B981",
        },
        surface: {
          DEFAULT: "#F8F9FA",
          dark: "#182432",
        },
        // Wxpr neutral scale
        gray: {
          900: "#182432",
          800: "#1F2937",
          700: "#333D4B",
          500: "#6B7684",
          300: "#D1D6DB",
          100: "#F1F3F5",
        },
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#2F80ED",
        // Marketing-route text/border tokens (used by (marketing) components)
        text: {
          primary: "#182432",
          secondary: "#4E5968",
        },
        border: {
          DEFAULT: "#E5E8EB",
        },
      },
      fontFamily: {
        sans: ["Pretendard Variable", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SF Mono", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
        pill: "9999px",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        hover: "0 4px 12px 0 rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.06)",
      },
    },
  },
  plugins: [],
}

export default config
