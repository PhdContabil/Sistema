import type { Config } from "tailwindcss";

// Tailwind é usado apenas pelo módulo Societário (migrado do app
// societario-phd). O restante do hub usa CSS puro — por isso o "content"
// fica restrito às pastas do módulo, e o preflight (reset global de estilos)
// fica desligado para não afetar os outros módulos (Fiscal, Financeiro etc.).
const config: Config = {
  content: [
    "./app/m/societario/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/societario/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#6D28D9",
          50: "#F5F3FF",
          100: "#EDE9FE",
          500: "#8B5CF6",
          600: "#7C3AED",
          700: "#6D28D9",
          900: "#4C1D95",
        },
      },
    },
  },
  plugins: [],
};
export default config;
