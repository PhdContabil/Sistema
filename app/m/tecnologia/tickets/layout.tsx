import "./globals.css";

// Habilita o Tailwind (com preflight escopado) só dentro do módulo de
// Tickets — o resto do hub continua em CSS puro, sem sofrer o reset do
// Tailwind. Ver globals.css deste diretório para o porquê do escopo.
//
// A barra lateral fica dentro do painel do próprio sistema de Tickets
// (components/apps/TicketsShell.tsx), não aqui no layout — assim o
// cabeçalho do Núcleo Contábil (Workspace, com o "Voltar" e as migalhas de
// pão) continua por fora, em camadas: Núcleo Contábil por fora, sistema de
// Tickets por dentro.
export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  return <div className="tickets-scope">{children}</div>;
}
