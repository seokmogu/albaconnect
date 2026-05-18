import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        // Albamon brand palette
        primary: {
          DEFAULT: "#FF6E0D",
          light: "#FF8A3D",
          dark: "#E55E00",
          // Keep legacy blue shades for existing (marketing) pages
          50: "#eff6ff",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        secondary: {
          DEFAULT: "#1A1A1A",
          light: "#333333",
          dark: "#000000",
        },
        accent: {
          DEFAULT: "#22C55E",
        },
        surface: {
          DEFAULT: "#F5F6F8",
          dark: "#111827",
        },
        // Albamon JDS grayscale
        gray: {
          900: "#1A1A1A",
          800: "#333333",
          700: "#666666",
          500: "#999999",
          300: "#CCCCCC",
          100: "#F0F0F0",
        },
        success: "#22C55E",
        warning: "#F59E0B",
        error: "#FF4D4D",
        info: "#3B82F6",
        // Marketing-route text/border tokens (used by (marketing) components)
        text: {
          primary: "#1A1A1A",
          secondary: "#666666",
        },
        border: {
          DEFAULT: "#EEEEEE",
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
