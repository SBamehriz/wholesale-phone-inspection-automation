import type { Config } from "tailwindcss";

/** Maps a raw HSL token to a colour that still takes the Tailwind opacity modifier. */
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: {
          DEFAULT: token("surface"),
          sunken: token("surface-sunken"),
          raised: token("surface-raised"),
        },
        ink: {
          DEFAULT: token("ink"),
          secondary: token("ink-secondary"),
          tertiary: token("ink-tertiary"),
          "on-accent": token("ink-on-accent"),
        },
        line: {
          DEFAULT: token("line"),
          strong: token("line-strong"),
        },
        accent: {
          DEFAULT: token("accent"),
          hover: token("accent-hover"),
          soft: token("accent-soft"),
          ink: token("accent-ink"),
        },
        positive: { DEFAULT: token("positive"), soft: token("positive-soft") },
        caution: { DEFAULT: token("caution"), soft: token("caution-soft") },
        critical: { DEFAULT: token("critical"), soft: token("critical-soft") },
        info: { DEFAULT: token("info"), soft: token("info-soft") },
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm: "var(--radius-sm)",
        lg: "var(--radius-lg)",
        xl: "calc(var(--radius-lg) + 6px)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
        exit: "var(--ease-exit)",
      },
    },
  },
  plugins: [],
} satisfies Config;
