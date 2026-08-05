// Registro dos módulos e aplicações do Núcleo Contábil.
// href definido = aplicação já construída; sem href = "Em breve".

export interface AppItem {
  name: string;
  desc: string;
  href?: string;
}

export interface ModuleDef {
  id: string;
  name: string;
  initials: string;
  color: string;
  desc: string;
  apps: AppItem[];
}

export const MODULES: ModuleDef[] = [
  {
    id: "fiscal", name: "Fiscal", initials: "FI", color: "oklch(0.62 0.13 255)",
    desc: "Apuração de tributos, notas fiscais e obrigações acessórias.",
    apps: [
      { name: "Simples Nacional", desc: "Análise de limite, faturamento, projeção e estouro do Simples.", href: "/m/fiscal/simples" },
      { name: "DCTFWeb", desc: "Empresas obrigadas por competência e débito apurado.", href: "/m/fiscal/dctfweb" },
      { name: "Apuração de Impostos", desc: "Cálculo de ICMS, PIS, COFINS e IPI por competência." },
      { name: "Notas Fiscais", desc: "Emissão, importação e escrituração de NF-e e NFS-e." },
      { name: "SPED Fiscal", desc: "Geração, validação e transmissão dos arquivos." },
      { name: "Obrigações Acessórias", desc: "Controle de entregas e prazos por cliente." },
    ],
  },
  {
    id: "pessoas", name: "Pessoas", initials: "PE", color: "oklch(0.62 0.13 150)",
    desc: "Nossa gente: cultura, comunicação, saúde, normas e desenvolvimento.",
    apps: [
      { name: "Meu perfil", desc: "Preencha seus dados: foto, histórico, formação e cursos.", href: "/m/pessoas/meu-perfil" },
      { name: "Ponto Digital", desc: "Registre seu ponto sem sair do sistema.", href: "/m/pessoas/ponto" },
      { name: "Sobre nós", desc: "História, hierarquia e cultura da PHD.", href: "/m/pessoas/sobre-nos" },
      { name: "Pessoas", desc: "Quem é quem, por setor.", href: "/m/pessoas/pessoas" },
      { name: "Comunicação", desc: "Férias, ausências, reuniões e confraternizações.", href: "/m/pessoas/comunicacao" },
      { name: "Remuneração", desc: "Cargos e salários, PLR e benefícios.", href: "/m/pessoas/remuneracao" },
      { name: "Saúde e Bem-Estar", desc: "Escuta, exames, convênios e saúde mental.", href: "/m/pessoas/saude" },
      { name: "Normas e Procedimentos", desc: "Políticas internas da PHD.", href: "/m/pessoas/normas" },
      { name: "Avaliação de Desempenho", desc: "Experiência e avaliação semestral.", href: "/m/pessoas/avaliacao" },
    ],
  },
  {
    id: "trabalhista", name: "Trabalhista", initials: "TR", color: "oklch(0.62 0.13 170)",
    desc: "Folha de pagamento, eSocial e rotinas de departamento pessoal.",
    apps: [
      { name: "Folha de Pagamento", desc: "Cálculo de salários, encargos e benefícios." },
      { name: "eSocial", desc: "Eventos, envios e retornos ao governo." },
      { name: "Admissões", desc: "Registro e onboarding de novos colaboradores." },
      { name: "Férias e 13º", desc: "Programação, avisos e cálculos." },
      { name: "Rescisões", desc: "Cálculo de verbas e homologação." },
      { name: "Ponto Eletrônico", desc: "Apuração de jornadas e horas extras." },
    ],
  },
  {
    id: "financeiro", name: "Financeiro", initials: "FN", color: "oklch(0.62 0.13 200)",
    desc: "Conciliação de honorários, contas e fluxo de caixa.",
    apps: [
      { name: "Conciliação de Honorários", desc: "Honorários contratados x movimento real de cada setor.", href: "/m/financeiro/conciliacao" },
      { name: "Contas a Pagar", desc: "Gestão de fornecedores e agenda de pagamentos." },
      { name: "Contas a Receber", desc: "Controle de recebimentos e inadimplência." },
      { name: "Fluxo de Caixa", desc: "Projeção de entradas e saídas por período." },
      { name: "Conciliação Bancária", desc: "Cruzamento automático de extratos." },
      { name: "DRE Gerencial", desc: "Resultados e margens por período." },
    ],
  },
  {
    id: "paralegal", name: "Paralegal", initials: "PL", color: "oklch(0.62 0.13 305)",
    desc: "Certidões, processos, prazos e gestão documental.",
    apps: [
      { name: "Certidões", desc: "Emissão e monitoramento de regularidade." },
      { name: "Processos", desc: "Acompanhamento de andamentos e diligências." },
      { name: "Prazos", desc: "Agenda de vencimentos e alertas." },
      { name: "Procurações", desc: "Controle de mandatos e vigências." },
      { name: "Documentos", desc: "Repositório digital por cliente." },
      { name: "Protocolos", desc: "Registro de protocolos em órgãos públicos." },
    ],
  },
  {
    id: "contabil", name: "Contábil", initials: "CT", color: "oklch(0.62 0.13 60)",
    desc: "Lançamentos, balancetes, demonstrações e SPED Contábil.",
    apps: [
      { name: "Lançamentos", desc: "Registro de partidas dobradas e lotes." },
      { name: "Balancete", desc: "Verificação de saldos e conferência." },
      { name: "Balanço Patrimonial", desc: "Demonstrações contábeis do período." },
      { name: "Plano de Contas", desc: "Estrutura e classificação contábil." },
      { name: "Conciliações", desc: "Fechamento e conferência de contas." },
      { name: "SPED Contábil", desc: "Geração de ECD e ECF." },
    ],
  },
  {
    id: "societario", name: "Societário", initials: "SO", color: "oklch(0.62 0.13 20)",
    desc: "Processos societários, empresas e atos societários — migrado do Societário PHD.",
    apps: [
      { name: "Dashboard", desc: "Visão geral, indicadores e atividade recente dos processos.", href: "/m/societario" },
      { name: "Processos", desc: "Listagem com filtros, detalhe e atividades de cada processo.", href: "/m/societario/processos" },
      { name: "Novo processo", desc: "Abertura de novo processo societário com atividades.", href: "/m/societario/processos/novo" },
      { name: "Empresas", desc: "Empresas com processos abertos e concluídos.", href: "/m/societario/empresas" },
      { name: "Tipos de processo", desc: "Cadastro dos tipos de processo (admin).", href: "/m/societario/tipos-processo" },
      { name: "Usuários", desc: "Gestão de usuários autorizados no módulo (admin).", href: "/m/societario/admin/usuarios" },
    ],
  },
];

export function getModule(id: string): ModuleDef | undefined {
  return MODULES.find((m) => m.id === id);
}

export function appInitials(name: string): string {
  const w = name.replace(/[^A-Za-zÀ-ú ]/g, "").trim().split(/\s+/);
  return ((w[0]?.[0] || "") + (w[1]?.[0] || w[0]?.[1] || "")).toUpperCase();
}
