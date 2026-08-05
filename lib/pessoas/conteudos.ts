// ============================================================================
// CONTEÚDOS DO APP PESSOAS — edite os textos aqui; as telas se atualizam.
//
// Como editar:
//   • texto: string única (parágrafo). Use \n\n para separar parágrafos.
//   • pendente: true  -> aparece o aviso "conteúdo em elaboração" na tela.
//   • Ao colar o texto definitivo, troque pendente para false (ou remova).
// ============================================================================

export interface Secao {
  id: string;
  titulo: string;
  /** Descrição curta exibida no card. */
  resumo: string;
  /** Texto completo da tela (aceita \n\n para parágrafos). */
  texto?: string;
  /** true = ainda sem conteúdo definitivo. */
  pendente?: boolean;
  /** Sub-itens (terceiro nível). */
  itens?: Secao[];
  /** Link externo (abre em nova aba). */
  externo?: string;
  /** Tela especial (renderização própria). */
  especial?: "hierarquia" | "pessoas" | "agenda";
  /** Link interno direto (o card abre esta rota em vez da tela de conteúdo). */
  rota?: string;
  /** Aviso de onde virá o dado (ex.: preenchido manualmente pelo JR). */
  nota?: string;
}

export interface AreaPessoas {
  id: string;
  titulo: string;
  resumo: string;
  cor: string;
  secoes: Secao[];
}

export const PONTO_DIGITAL_URL = "https://gestor.coalize.com.br/login";

export const AREAS: AreaPessoas[] = [
  {
    id: "sobre-nos", titulo: "Sobre nós", resumo: "História, hierarquia e cultura da PHD.",
    cor: "oklch(0.62 0.13 255)",
    secoes: [
      { id: "historia", titulo: "História", resumo: "Como a PHD começou e chegou até aqui.", pendente: true, nota: "Texto a ser fornecido pelo Júnior." },
      { id: "hierarquia", titulo: "Hierarquia", resumo: "Organograma: gestores e setores.", especial: "hierarquia" },
      { id: "cultura", titulo: "Cultura", resumo: "Missão, visão, valores e planejamento estratégico.", pendente: true, nota: "Texto a ser fornecido pelo Júnior." },
    ],
  },
  {
    id: "pessoas", titulo: "Pessoas", resumo: "Quem é quem, por setor — e o espaço de cada um.",
    cor: "oklch(0.62 0.13 150)",
    secoes: [
      { id: "equipe", titulo: "Setor e Nome", resumo: "Relação das pessoas organizada por setor.", especial: "pessoas" },
      { id: "meu-perfil", titulo: "Meu perfil", resumo: "Preencha seus dados: foto, histórico, formação, cursos e gostos.", rota: "/m/pessoas/meu-perfil" },
      { id: "sobre-mim", titulo: "Sobre mim", resumo: "Apresente-se: gostos, hobbies e curiosidades.", rota: "/m/pessoas/meu-perfil" },
      { id: "formacao", titulo: "Formação acadêmica", resumo: "Cadastre suas formações, com grau, instituição e período.", rota: "/m/pessoas/meu-perfil" },
      { id: "cursos", titulo: "Cursos e eventos", resumo: "Cursos, congressos, seminários e apresentações.", rota: "/m/pessoas/meu-perfil" },
      { id: "espaco-cultural", titulo: "Espaço cultural", resumo: "Livros, feiras e apresentações que fazem parte da sua história.", rota: "/m/pessoas/meu-perfil" },
    ],
  },
  {
    id: "comunicacao", titulo: "Comunicação", resumo: "Férias, ausências, reuniões e confraternizações.",
    cor: "oklch(0.62 0.13 200)",
    secoes: [
      {
        id: "ferias", titulo: "Férias", resumo: "Solicitação, períodos a vencer e agendados.",
        itens: [
          { id: "solicite", titulo: "Solicite", resumo: "Informe o mês e os dias desejados.", texto: "Informe o mês e os dias em que gostaria de tirar férias. É possível escolher dois períodos no ano, se desejar.", pendente: true, nota: "Formulário será ativado numa próxima etapa." },
          { id: "a-vencer", titulo: "A vencer", resumo: "Períodos aquisitivos próximos do vencimento.", pendente: true, nota: "Preenchido manualmente pelo Júnior (no futuro, direto do Questor)." },
          { id: "agendadas", titulo: "Agendadas", resumo: "Férias já programadas da equipe.", pendente: true, nota: "Preenchido manualmente pelo Júnior." },
        ],
      },
      {
        id: "ausencias", titulo: "Ausências", resumo: "Solicitação de banco de horas e demais ausências.",
        itens: [
          { id: "solicite", titulo: "Solicite", resumo: "Peça dias de descanso (B.H.) e demais ausências.", texto: "Solicite dias de descanso (banco de horas) e/ou demais ausências. Cite o dia e o horário. Fica a seu critério justificar o motivo.", pendente: true, nota: "Formulário será ativado numa próxima etapa." },
          { id: "resposta", titulo: "Resposta", resumo: "Confirmação ou negativa do gestor.", pendente: true, nota: "Retorno do gestor sobre a solicitação." },
        ],
      },
      {
        id: "reunioes", titulo: "Reuniões", resumo: "Agenda de reuniões: data, local e horário.",
        itens: [{ id: "agenda", titulo: "Agenda", resumo: "Data, local e horário das reuniões.", pendente: true, nota: "Preenchido manualmente." }],
      },
      {
        id: "confraternizacao", titulo: "Confraternização", resumo: "Agenda dos encontros e álbum de fotos.",
        itens: [{ id: "agenda", titulo: "Agenda e fotos", resumo: "Datas dos encontros e arquivo de fotos.", pendente: true, nota: "Preenchido manualmente." }],
      },
    ],
  },
  {
    id: "remuneracao", titulo: "Remuneração", resumo: "Cargos e salários, PLR e demais benefícios.",
    cor: "oklch(0.62 0.13 60)",
    secoes: [
      { id: "cargos-salarios", titulo: "Cargos e salários", resumo: "Histórico da folha e ficha de atualização da CTPS.", pendente: true, nota: "Futuramente puxado do histórico da folha." },
      { id: "plr", titulo: "PLR", resumo: "Participação nos lucros e resultados.", pendente: true },
      { id: "outros", titulo: "Outros", resumo: "Demais itens de remuneração.", pendente: true },
    ],
  },
  {
    id: "saude", titulo: "Saúde e Bem-Estar", resumo: "Escuta, exames, convênios, saúde mental e segurança.",
    cor: "oklch(0.62 0.13 305)",
    secoes: [
      {
        id: "escuta", titulo: "Seu espaço de escuta", resumo: "Agende uma conversa reservada.",
        itens: [{ id: "agende", titulo: "Agende", resumo: "Marque seu horário.", pendente: true, nota: "Detalhamento a ser definido pelo Júnior." }],
      },
      {
        id: "exames", titulo: "Exames médicos — NR7", resumo: "Exames ocupacionais realizados e agendados.",
        itens: [
          { id: "realizados", titulo: "Realizados", resumo: "Histórico de exames já realizados.", pendente: true, nota: "Alimentado manualmente pelo Júnior." },
          { id: "agendados", titulo: "Agendados", resumo: "Próximos exames marcados.", pendente: true, nota: "Alimentado manualmente pelo Júnior." },
        ],
      },
      { id: "alimentar", titulo: "Saúde alimentar", resumo: "Orientações sobre alimentação.", pendente: true, nota: "Texto explicativo do Júnior." },
      {
        id: "fisica", titulo: "Saúde física", resumo: "Convênios médico e odontológico e academia.",
        itens: [
          { id: "convenio-medico", titulo: "Convênio médico", resumo: "Como funciona e como utilizar.", pendente: true, nota: "Texto explicativo do Júnior." },
          { id: "convenio-odonto", titulo: "Convênio odontológico", resumo: "Como funciona e como utilizar.", pendente: true, nota: "Texto explicativo do Júnior." },
          { id: "gympass", titulo: "Gympass / Pass Total", resumo: "Acesso a academias e atividades físicas.", pendente: true, nota: "Texto explicativo do Júnior." },
        ],
      },
      {
        id: "mental", titulo: "Saúde mental — NR1", resumo: "Orientações, diagnóstico e ações.",
        itens: [
          { id: "orientacoes", titulo: "Orientações", resumo: "Medidas iniciais adotadas pela PHD.", pendente: true, nota: "Texto do Júnior." },
          { id: "diagnostico", titulo: "Diagnóstico", resumo: "Como é feito o diagnóstico.", pendente: true, nota: "Texto do Júnior." },
          { id: "acoes", titulo: "Ações", resumo: "Ações em andamento e previstas.", pendente: true, nota: "Texto do Júnior." },
        ],
      },
      { id: "seguranca-trabalho", titulo: "Segurança do trabalho", resumo: "Laudos e normas de segurança da PHD.", pendente: true, nota: "Explicação dos laudos existentes." },
      { id: "seguro-vida", titulo: "Seguro de vida", resumo: "Regras da apólice, para quando precisar.", pendente: true, nota: "Regras da apólice a serem descritas." },
    ],
  },
  {
    id: "normas", titulo: "Normas e Procedimentos", resumo: "Políticas internas da PHD.",
    cor: "oklch(0.62 0.13 20)",
    secoes: [
      { id: "ausencias", titulo: "Ausências", resumo: "Política de ausências: quem avisar e como proceder.", pendente: true, nota: "Texto do Júnior." },
      { id: "alimentacao", titulo: "Alimentação", resumo: "Café da manhã, almoço, marmitas e demais regras.", pendente: true, nota: "Texto do Júnior." },
      { id: "lgpd", titulo: "Segurança da informação (LGPD)", resumo: "Cuidados com dados e informações.", pendente: true, nota: "Documento já existente — colar aqui." },
      { id: "postura", titulo: "Postura e comportamento", resumo: "O que se espera da convivência no dia a dia.", pendente: true, nota: "Documento já existente — colar aqui." },
    ],
  },
  {
    id: "avaliacao", titulo: "Avaliação de Desempenho", resumo: "Período de experiência e avaliação semestral.",
    cor: "oklch(0.62 0.13 100)",
    secoes: [
      { id: "experiencia", titulo: "Período de experiência", resumo: "Como funciona a avaliação nos primeiros meses.", pendente: true, nota: "Texto do Júnior; futuramente preenchido pelo líder." },
      { id: "semestral", titulo: "Avaliação semestral", resumo: "Ciclo semestral de avaliação.", pendente: true, nota: "Texto do Júnior; futuramente preenchido pelo líder." },
    ],
  },
];

// ===== Agenda semanal (tela inicial) =====
// Legenda usada nas marcações do quadro.
export const AGENDA_LEGENDA: { sigla: string; rotulo: string; cor: string }[] = [
  { sigla: "A", rotulo: "Aniversário", cor: "#8b5cf6" },
  { sigla: "C", rotulo: "Confraternização", cor: "#ec4899" },
  { sigla: "E", rotulo: "Emenda de feriado", cor: "#0ea5e9" },
  { sigla: "F", rotulo: "Férias", cor: "#16a34a" },
  { sigla: "L", rotulo: "Licença B.H.", cor: "#f59e0b" },
  { sigla: "R", rotulo: "Reunião interna", cor: "#0f766e" },
];

export interface AgendaDia {
  /** Data no formato YYYY-MM-DD. */
  data: string;
  /** Marcações do dia: siglas da legenda. */
  marcas: { sigla: string; detalhe: string }[];
}

// Preencher semanalmente (exemplo baseado no rascunho da planilha).
export const AGENDA_SEMANA: AgendaDia[] = [
  { data: "2026-08-03", marcas: [{ sigla: "F", detalhe: "Férias: Pedro" }, { sigla: "E", detalhe: "Emenda de feriado" }] },
  { data: "2026-08-04", marcas: [{ sigla: "F", detalhe: "Férias: Pedro" }] },
  { data: "2026-08-05", marcas: [{ sigla: "F", detalhe: "Férias: Débora" }, { sigla: "L", detalhe: "Licença B.H.: Jaison" }] },
  { data: "2026-08-06", marcas: [{ sigla: "F", detalhe: "Férias: Mônica" }, { sigla: "C", detalhe: "Confraternização aniversário PHD" }, { sigla: "R", detalhe: "Reunião interna: encarregados" }] },
  { data: "2026-08-07", marcas: [{ sigla: "F", detalhe: "Férias: Mônica" }, { sigla: "A", detalhe: "Aniversário: Kelly, Ed Carlos" }] },
];

export function getArea(id: string): AreaPessoas | undefined {
  return AREAS.find((a) => a.id === id);
}
export function getSecao(areaId: string, secaoId: string): Secao | undefined {
  return getArea(areaId)?.secoes.find((s) => s.id === secaoId);
}
