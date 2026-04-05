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
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
