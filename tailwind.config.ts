import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B1220",
        panel: "#101B2E",
        "panel-2": "#16243C",
        line: "#23324D",
        muted: "#8FA3BF",
        emergency: { DEFAULT: "#E5484D", bright: "#FF5C62" },
        amber: { DEFAULT: "#F5A623" },
        success: { DEFAULT: "#2CC471" },
        route: "#5FB2FF"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"]
      }
    }
  },
  plugins: []
};
export default config;