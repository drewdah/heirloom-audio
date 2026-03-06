import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-playfair)", "Georgia", "serif"],
        sans:    ["var(--font-sans)", "-apple-system", "sans-serif"],
        mono:    ["ui-monospace", "monospace"],
      },
      colors: {
        // Modern palette
        "ha-base":     "#0a0a0a",
        "ha-elevated": "#141414",
        "ha-raised":   "#1c1c1e",
        "ha-overlay":  "#2c2c2e",
        "ha-accent":   "#3a7bd5",
        "ha-green":    "#30d158",
        "ha-red":      "#ff453a",
        // Shelf-only warm palette
        "shelf-wood":  "#2a1505",
        "shelf-amber": "#c8860a",
      },
      borderRadius: { DEFAULT: "8px" },
      boxShadow: {
        "ha-card": "0 2px 24px rgba(0,0,0,0.45)",
        "ha-accent": "0 4px 16px rgba(58,123,213,0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
