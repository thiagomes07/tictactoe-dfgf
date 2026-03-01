import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./types/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        paper: "#F5F0E8",
        paperDark: "#E8E0CC",
        govBlue: "#1B3A6B",
        stampRed: "#C0392B",
        stampBlue: "#2471A3",
        graphite: "#4A4A4A",
        inkBlack: "#1A1A1A",
        fadedGreen: "#7D9B76",
        chatNight: "#1E1E2E"
      },
      fontFamily: {
        form: ["var(--font-courier-prime)", "monospace"],
        system: ["var(--font-vt323)", "monospace"],
        title: ["var(--font-special-elite)", "serif"]
      },
      keyframes: {
        stampImpact: {
          "0%": { transform: "scale(0.2) rotate(var(--stamp-tilt))", opacity: "0" },
          "60%": { transform: "scale(1.08) rotate(var(--stamp-tilt))", opacity: "1" },
          "100%": { transform: "scale(1) rotate(var(--stamp-tilt))", opacity: "1" }
        },
        paperFeedIn: {
          "0%": { transform: "translateY(24px) rotate(var(--paper-tilt))", opacity: "0.2" },
          "100%": { transform: "translateY(0) rotate(var(--paper-tilt))", opacity: "1" }
        }
      },
      animation: {
        stampImpact: "stampImpact 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        paperFeedIn: "paperFeedIn 320ms ease-out"
      }
    }
  },
  plugins: []
};

export default config;
