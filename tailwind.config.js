/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        glass: "rgb(var(--glass) / <alpha-value>)",
        "glass-2": "rgb(var(--glass-2) / <alpha-value>)",
        "glass-border": "rgb(var(--glass-border) / <alpha-value>)",
        "glass-highlight": "rgb(var(--glass-highlight) / <alpha-value>)",
        text: "rgb(var(--text) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        gold: "rgb(var(--gold) / <alpha-value>)",
        "gold-soft": "rgb(var(--gold-soft) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "Apple Color Emoji",
          "Segoe UI Emoji",
        ],
      },
      borderRadius: {
        none: "0px",
        sm: "12px",
        DEFAULT: "16px",
        md: "16px",
        lg: "22px",
        xl: "28px",
        "2xl": "36px",
        "3xl": "48px",
        full: "9999px",
      },
      boxShadow: {
        "lux-md":
          "0 1px 0 rgb(var(--glass-highlight) / 0.70) inset, 0 16px 55px rgb(var(--shadow) / 0.10)",
        "lux-lg":
          "0 1px 0 rgb(var(--glass-highlight) / 0.72) inset, 0 36px 120px rgb(var(--shadow) / 0.14)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "100% 0" },
          "100%": { backgroundPosition: "0 0" },
        },
      },
      animation: {
        shimmer: "shimmer 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

