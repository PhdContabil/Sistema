// Ícones das aplicações dentro de cada módulo — recriados do handoff de
// design (Hub Nucleo Contabil.dc.html, pacote "Icons_Tela_inicial_hub_contabil").
// Mesmo estilo line-style dos ícones de módulo: stroke currentColor, 20x20.

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const APP_ICONS: Record<string, React.ReactNode> = {
  calculadora: (
    <Svg>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" y1="7" x2="16" y2="7" />
      <circle cx="8.5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="15.5" cy="12" r="1" />
      <circle cx="8.5" cy="16" r="1" /><circle cx="12" cy="16" r="1" /><circle cx="15.5" cy="16" r="1" />
    </Svg>
  ),
  documento: (
    <Svg>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6" />
    </Svg>
  ),
  recibo: (
    <Svg>
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </Svg>
  ),
  upload: (
    <Svg>
      <path d="M12 16V4" />
      <path d="M6 10l6-6 6 6" />
      <path d="M4 20h16" />
    </Svg>
  ),
  lista: (
    <Svg>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </Svg>
  ),
  carteira: (
    <Svg>
      <rect x="2" y="6" width="20" height="13" rx="2" />
      <path d="M2 10h20" />
      <circle cx="17" cy="15.5" r="1.4" />
    </Svg>
  ),
  pessoaMais: (
    <Svg>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="16" y1="11" x2="22" y2="11" />
    </Svg>
  ),
  calendario: (
    <Svg>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </Svg>
  ),
  arquivoMinus: (
    <Svg>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </Svg>
  ),
  relogio: (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </Svg>
  ),
  balanca: (
    <Svg>
      <line x1="12" y1="3" x2="12" y2="21" />
      <path d="M6 8l-3 6a3 3 0 0 0 6 0z" />
      <path d="M18 8l-3 6a3 3 0 0 0 6 0z" />
      <line x1="6.5" y1="5" x2="17.5" y2="5" />
    </Svg>
  ),
  cartao: (
    <Svg>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </Svg>
  ),
  caixaEntrada: (
    <Svg>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </Svg>
  ),
  tendencia: (
    <Svg>
      <path d="M23 6l-9.5 9.5-5-5L1 18" />
      <path d="M17 6h6v6" />
    </Svg>
  ),
  escudo: (
    <Svg>
      <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  ),
  pastaBusca: (
    <Svg>
      <path d="M22 13V6a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6" />
      <circle cx="18" cy="17" r="3" />
      <line x1="20.5" y1="19.5" x2="22" y2="21" />
    </Svg>
  ),
  alarme: (
    <Svg>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5" />
      <path d="M5 3L2 6" />
      <path d="M19 3l3 3" />
    </Svg>
  ),
  chave: (
    <Svg>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M11 12L21 2" />
      <path d="M16 7l3 3" />
      <path d="M13 10l3 3" />
    </Svg>
  ),
  pasta: (
    <Svg>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Svg>
  ),
  enviar: (
    <Svg>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </Svg>
  ),
  camadas: (
    <Svg>
      <path d="M12 2l9 5-9 5-9-5z" />
      <path d="M3 12l9 5 9-5" />
      <path d="M3 17l9 5 9-5" />
    </Svg>
  ),
  livro: (
    <Svg>
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z" />
      <line x1="4" y1="4.5" x2="4" y2="22" />
    </Svg>
  ),
  grafico: (
    <Svg>
      <line x1="4" y1="20" x2="4" y2="12" />
      <line x1="10" y1="20" x2="10" y2="6" />
      <line x1="16" y1="20" x2="16" y2="14" />
      <line x1="2" y1="22" x2="22" y2="22" />
    </Svg>
  ),
  predio: (
    <Svg>
      <rect x="4" y="2" width="16" height="20" rx="1" />
      <path d="M9 22v-4h6v4" />
    </Svg>
  ),
  ticket: (
    <Svg>
      <path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" />
      <line x1="13" y1="5" x2="13" y2="19" />
    </Svg>
  ),
  servidor: (
    <Svg>
      <rect x="2" y="3" width="20" height="7" rx="2" />
      <rect x="2" y="14" width="20" height="7" rx="2" />
      <circle cx="6" cy="6.5" r="0.6" />
      <circle cx="6" cy="17.5" r="0.6" />
    </Svg>
  ),
  grade: (
    <Svg>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Svg>
  ),
  ajuda: (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2 2-2 3.5" />
      <line x1="12" y1="17" x2="12" y2="17.1" />
    </Svg>
  ),
  usuario: (
    <Svg>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
    </Svg>
  ),
  info: (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="8.1" />
      <line x1="12" y1="12" x2="12" y2="16" />
    </Svg>
  ),
  usuarios: (
    <Svg>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  ),
  mensagem: (
    <Svg>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  ),
  cifrao: (
    <Svg>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </Svg>
  ),
  coracao: (
    <Svg>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </Svg>
  ),
  premio: (
    <Svg>
      <circle cx="12" cy="8" r="6" />
      <path d="M9 14l-1.5 7L12 19l4.5 2L15 14" />
    </Svg>
  ),
};

/** Mesma heurística por palavra-chave do handoff — escolhe o ícone pelo nome da aplicação. */
function chaveIcone(nomeApp: string): keyof typeof APP_ICONS {
  const n = nomeApp.toLowerCase();
  if (n.includes("simples")) return "documento";
  if (n.includes("dctf")) return "documento";
  if (n.includes("apuração de impostos")) return "calculadora";
  if (n.includes("notas fiscais")) return "recibo";
  if (n.includes("sped")) return "upload";
  if (n.includes("obrigações")) return "lista";
  if (n.includes("folha")) return "carteira";
  if (n.includes("esocial")) return "upload";
  if (n.includes("admiss")) return "pessoaMais";
  if (n.includes("férias")) return "calendario";
  if (n.includes("rescis")) return "arquivoMinus";
  if (n.includes("ponto")) return "relogio";
  if (n.includes("conciliação de honorários") || n.includes("conciliação bancária") || n.includes("conciliações")) return "balanca";
  if (n.includes("contas a pagar")) return "cartao";
  if (n.includes("contas a receber")) return "caixaEntrada";
  if (n.includes("fluxo de caixa") || n.includes("dre")) return "tendencia";
  if (n.includes("certidões")) return "escudo";
  if (n.includes("processos")) return "pastaBusca";
  if (n.includes("prazos")) return "alarme";
  if (n.includes("procurações")) return "chave";
  if (n.includes("documentos")) return "pasta";
  if (n.includes("protocolos")) return "enviar";
  if (n.includes("consolidação")) return "camadas";
  if (n.includes("lançamentos")) return "livro";
  if (n.includes("balancete")) return "grafico";
  if (n.includes("balanço")) return "predio";
  if (n.includes("plano de contas")) return "lista";
  if (n.includes("tickets")) return "ticket";
  if (n.includes("inventário")) return "servidor";
  if (n.includes("catálogo")) return "grade";
  if (n.includes("conhecimento")) return "ajuda";
  if (n.includes("meu perfil")) return "usuario";
  if (n.includes("sobre nós")) return "info";
  if (n === "pessoas") return "usuarios";
  if (n.includes("comunicação")) return "mensagem";
  if (n.includes("remuneração")) return "cifrao";
  if (n.includes("saúde")) return "coracao";
  if (n.includes("normas")) return "escudo";
  if (n.includes("avaliação")) return "premio";
  if (n.includes("digital")) return "relogio";
  if (n.includes("dashboard")) return "grafico";
  if (n.includes("empresas")) return "predio";
  if (n.includes("tipos de processo")) return "grade";
  if (n.includes("usuários") || n.includes("usuarios")) return "usuarios";
  if (n.includes("novo processo")) return "documento";
  return "documento";
}

export default function AppIcon({ nome }: { nome: string }) {
  return <>{APP_ICONS[chaveIcone(nome)]}</>;
}
