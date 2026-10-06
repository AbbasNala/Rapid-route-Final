import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ops: {
          950: "#080C11",
          900: "#0D131B",
          850: "#121A24",
          800: "#18222E",
          700: "#243244",
          600: "#3A4C61",
          500: "#4A5E76",
          400: "#8FA3B8",
          300: "#B7C6D4",
        },
        emergency: { DEFAULT: "#E5484D", bright: "#FF5757" },
        warn: "#FFB224",
        ok: "#3DD68C",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"],
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
