import type { Config } from "tailwindcss";

// Institutional, dense, data-forward — the "brutalist fintech" palette from the design comps:
// near-black ink, a single mint accent, off-white paper, hairline borders. No component-library look.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a0a",
        mint: "#16d97f",
        paper: "#f2f2f0",
        panel: "#fafaf8",
        hair: "#e4e4e0",
        amber: "#a3611f",
        muted: "#666666",
        faint: "#9a9a96",
      },
      fontFamily: {
        // `sans` = the design's Helvetica Neue display face; `mono` = Space Mono (loaded in layout).
        sans: ['"Helvetica Neue"', "Helvetica", "Arial", "sans-serif"],
        mono: ["var(--font-space-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
