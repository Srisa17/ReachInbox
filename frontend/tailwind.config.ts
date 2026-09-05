import type { Config } from "tailwindcss";

// Design tokens for the ReachInbox scheduler "control tower" dashboard.
// Palette: deep ink background, amber for primary actions/"sent", teal for
// "scheduled" state, slate for secondary text. See README for rationale.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0B0D12",
          900: "#0F1115",
          800: "#171A21",
          700: "#20242E",
          600: "#2B3040",
        },
        paper: "#EDEDF0",
        slate: {
          400: "#8B93A7",
          300: "#A9B0C2",
        },
        amber: {
          400: "#F5A623",
          500: "#E0941A",
        },
        teal: {
          400: "#4FD1C5",
          500: "#38B2AC",
        },
        rose: {
          400: "#F2607A",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
