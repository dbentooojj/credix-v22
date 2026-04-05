import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#4F7EF7",
          hover: "#3b6ef0",
          light: "rgba(79, 126, 247, 0.08)",
          shadow: "rgba(79, 126, 247, 0.35)",
          glow: "rgba(79, 126, 247, 0.4)",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F7F9FC",
          page: "#F0F4FA",
        },
        ink: {
          DEFAULT: "#0f172a",
          soft: "#475569",
          muted: "#64748b",
        },
        line: {
          DEFAULT: "rgba(203, 213, 225, 0.7)",
          soft: "rgba(226, 232, 240, 0.8)",
        },
        brand: {
          gold: "#D8AF2F",
        },
      },
      borderRadius: {
        "2xl": "1.125rem",
      },
      boxShadow: {
        card: "0 1px 3px rgba(15, 23, 42, 0.06), 0 4px 16px rgba(15, 23, 42, 0.05)",
        "card-hover": "0 4px 20px rgba(15, 23, 42, 0.10)",
        "primary-glow": "0 4px 14px rgba(79, 126, 247, 0.4)",
        "primary-sm": "0 4px 12px rgba(79, 126, 247, 0.35)",
        panel: "0 14px 34px rgba(15, 23, 42, 0.08)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(100%)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease forwards",
        "slide-up": "slide-up 0.4s ease forwards",
        "slide-in-right": "slide-in-right 0.3s ease forwards",
      },
    },
  },
  plugins: [],
};

export default config;
