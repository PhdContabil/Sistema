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
    id: "trabalhista", name: "Trabalhista", initials: "TR", color: "oklch(0.62 0.13 150)",
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
    desc: "Abertura, alteração e baixa de empresas e atos societários.",
    apps: [
      { name: "Abertura de Empresas", desc: "Constituição, DBE e registro." },
      { name: "Alterações Contratuais", desc: "Mudanças cadastrais e de quadro societário." },
      { name: "Baixa de Empresas", desc: "Encerramento e distrato de atividades." },
      { name: "Contratos Sociais", desc: "Elaboração, versões e guarda." },
      { name: "Registro na Junta", desc: "Protocolo e acompanhamento de atos." },
      { name: "Certificados Digitais", desc: "Emissão e renovação e-CNPJ/e-CPF." },
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
