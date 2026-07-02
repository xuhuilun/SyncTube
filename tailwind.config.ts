import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Single neon-blue accent, locked across the whole app.
        accent: {
          DEFAULT: "#00d4ff",
          soft: "#6c63ff",
          glow: "rgba(0, 212, 255, 0.35)",
        },
        // Off-black dark surfaces (no pure #000).
        surface: {
          900: "#070b14",
          800: "#0b1120",
          700: "#111a2e",
          600: "#1a2740",
        },
        border: {
          subtle: "rgba(255, 255, 255, 0.08)",
          strong: "rgba(255, 255, 255, 0.16)",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        // Shape consistency lock: one radius scale.
        xl: "1rem",
        "2xl": "1.25rem",
      },
      backgroundImage: {
        "glass-gradient":
          "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
        "page-radial":
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(0,212,255,0.18), transparent 60%), radial-gradient(ellipse 60% 50% at 100% 100%, rgba(108,99,255,0.12), transparent 60%)",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0,0,0,0.37), inset 0 1px 0 rgba(255,255,255,0.08)",
        "accent-glow": "0 0 24px rgba(0, 212, 255, 0.25)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
