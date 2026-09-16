import "./globals.css";

// Habilita o Tailwind (com preflight escopado) só dentro do módulo de
// Inventário de TI — o resto do hub continua em CSS puro, sem sofrer o
// reset do Tailwind. Ver globals.css deste diretório para o porquê do
// escopo. Mesmo padrão usado por Tickets (app/m/tecnologia/tickets/layout.tsx)
// e Societário.
//
// Sem este layout.tsx (e o globals.css que ele importa), nenhum arquivo
// deste módulo chega a conter as diretivas @tailwind — o content glob do
// tailwind.config.ts sozinho não basta, porque não existe nenhum ponto de
// entrada de CSS puxando o Tailwind pra dentro do bundle desta rota. Foi
// isso que causava a tela sem nenhum estilo (inclusive o ícone de busca
// gigante, renderizado no tamanho intrínseco do SVG por falta de w-4/h-4).
export default function InventarioLayout({ children }: { children: React.ReactNode }) {
  return <div className="inventario-scope">{children}</div>;
}
