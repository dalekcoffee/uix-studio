/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#1f2937",
        panelAlt: "#111827",
        accent: "#38bdf8",
        // Replace Tailwind's blue-tinged "slate" ramp with a neutral charcoal/gray
        // ladder so the outer UI chrome (toolbar, sidebars, borders, buttons)
        // reads as pure dark instead of bluish dark.
        slate: {
          50:  "#F5F5F5",
          100: "#E5E5E5",
          200: "#D4D4D4",
          300: "#B3B3B3",
          400: "#8C8C8C",
          500: "#666666",
          600: "#4A4A4A",
          700: "#2E2E2E",
          800: "#1A1A1A",
          900: "#0D0D0D",
          950: "#060606",
        },
      },
    },
  },
  plugins: [],
};
