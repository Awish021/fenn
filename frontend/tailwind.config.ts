import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        glow: "0 0 0 1px rgba(45, 212, 191, 0.25), 0 10px 30px rgba(15, 23, 42, 0.18)",
      },
      colors: {
        brand: {
          50: "#f1f8ff",
          100: "#dcefff",
          500: "#2772d1",
          700: "#144883",
          900: "#0c2748",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
