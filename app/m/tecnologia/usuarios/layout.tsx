import "../tickets/globals.css";

// Mesmo escopo do Tailwind usado pelo módulo de Tickets (ver
// app/m/tecnologia/tickets/layout.tsx) — esta tela reaproveita o componente
// TicketsUsuarios, que é todo em classes Tailwind, mas por estar fora de
// app/m/tecnologia/tickets/** ela não herdava o CSS gerado, e por isso
// aparecia sem nenhum estilo (tabela crua, botões do navegador). Repetindo
// o mesmo padrão de escopo aqui resolve.
export default function UsuariosTecnologiaLayout({ children }: { children: React.ReactNode }) {
  return <div className="tickets-scope">{children}</div>;
}
