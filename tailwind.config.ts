import type { Config } from "tailwindcss";

// Tailwind é usado pelo módulo Societário (migrado do app societario-phd),
// desde 08/2026 pelo visual escuro do módulo de Tickets (Tecnologia) e desde
// 09/2026 pelo Inventário de TI (mesma família visual do Tickets). O
// restante do hub usa CSS puro — por isso o "content" fica restrito a essas
// pastas, e o preflight (reset global de estilos) fica desligado para não
// afetar os outros módulos (Fiscal, Financeiro etc.).
const config: Config = {
  // O Tickets e o Inventário de TI seguem o mesmo interruptor claro/escuro
  // do resto do hub (document.documentElement.dataset.theme, ver
  // components/ThemeToggle.tsx) em vez do prefers-color-scheme do navegador.
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./app/m/societario/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/societario/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/m/tecnologia/tickets/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/m/tecnologia/inventario/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/apps/Tickets*.{js,ts,jsx,tsx,mdx}",
    "./components/apps/InventarioTI.{js,ts,jsx,tsx,mdx}",
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
