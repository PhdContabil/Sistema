// Equipe PHD — extraído da planilha "Aplicativo G.Pessoas" (aba HIERARQUIA).
// Para atualizar: edite as listas abaixo.

export interface Pessoa {
  nome: string;
  formacao: string;
  funcao: string;
  /** Espaço "Sobre mim" — a pessoa se apresenta (preencher). */
  sobre?: string;
  /** Caminho da foto em /public (ex.: "/pessoas/marcio.jpg"). */
  foto?: string;
}

export interface Setor {
  id: string;
  nome: string;
  pessoas: Pessoa[];
}

export const GESTORES: Pessoa[] = [
  { nome: "Ed Carlos", formacao: "Contador e bacharel em Direito", funcao: "Área Comercial" },
  { nome: "Júnior", formacao: "Contador e psicólogo", funcao: "Gestão de Pessoas e Finanças" },
  { nome: "Eduardo", formacao: "Contador especializado em TI", funcao: "Gestão de Processos e Inovação Tecnológica" },
];

export const SETORES: Setor[] = [
  {
    id: "trabalhista", nome: "Setor Trabalhista",
    pessoas: [
      { nome: "Márcio", formacao: "Gestão em RH", funcao: "Encarregado" },
      { nome: "Aline", formacao: "Gestão em RH", funcao: "Analista" },
      { nome: "Jaison", formacao: "Contador", funcao: "Analista" },
      { nome: "Jaine", formacao: "Gestão em RH", funcao: "Assistente" },
      { nome: "Gean", formacao: "Contador", funcao: "Assistente" },
      { nome: "Maria", formacao: "Administradora", funcao: "Auxiliar" },
      { nome: "Luiza", formacao: "Economia (estudante)", funcao: "Estagiária" },
    ],
  },
  {
    id: "tributario", nome: "Setor Tributário",
    pessoas: [
      { nome: "Giovanna", formacao: "Ciências Contábeis (estudante)", funcao: "Analista" },
      { nome: "Gustavo", formacao: "Ciências Contábeis (estudante)", funcao: "Analista" },
      { nome: "Gregory", formacao: "Ciências Contábeis (estudante)", funcao: "Assistente" },
      { nome: "Milena", formacao: "Design de Interiores", funcao: "Auxiliar" },
    ],
  },
  {
    id: "contabil", nome: "Setor Contábil",
    pessoas: [
      { nome: "Mônica", formacao: "Contadora", funcao: "Encarregada" },
      { nome: "Carolina", formacao: "Contadora", funcao: "Analista" },
      { nome: "Maísa", formacao: "Contadora", funcao: "Auxiliar" },
      { nome: "Julia Rodrigues", formacao: "Psicologia (estudando)", funcao: "Auxiliar" },
      { nome: "Mariana", formacao: "Ciências Contábeis (estudando)", funcao: "Auxiliar" },
    ],
  },
  {
    id: "mei", nome: "Setor MEI",
    pessoas: [
      { nome: "Carla", formacao: "Comunicação, Espec. Marketing", funcao: "Encarregada" },
      { nome: "Luana", formacao: "Publicidade e Propaganda / Marketing", funcao: "Assistente" },
      { nome: "Isabelly", formacao: "Ensino Médio", funcao: "Auxiliar" },
      { nome: "Beatriz", formacao: "Técnica em Informática", funcao: "Auxiliar" },
      { nome: "Julia Araujo", formacao: "Ciências Contábeis (estudando)", funcao: "Auxiliar" },
    ],
  },
  {
    id: "paralegal", nome: "Setor Paralegal",
    pessoas: [
      { nome: "Flávia", formacao: "Psicologia (estudante)", funcao: "Encarregada" },
      { nome: "Rafael", formacao: "Técnico em Radiologia", funcao: "Analista" },
      { nome: "Júlia Helena", formacao: "Ciências da Computação (estudante)", funcao: "Analista" },
      { nome: "Sara", formacao: "Ciências Contábeis (estudante)", funcao: "Auxiliar" },
    ],
  },
  {
    id: "financeiro", nome: "Setor Financeiro",
    pessoas: [
      { nome: "Débora", formacao: "Gestão Financeira", funcao: "Encarregada" },
      { nome: "Graciele", formacao: "Contadora", funcao: "Analista" },
      { nome: "Eloiza", formacao: "Administradora, Espec. Eventos", funcao: "Analista" },
    ],
  },
  {
    id: "tecnologia", nome: "Tecnologia e Inovação",
    pessoas: [
      { nome: "Gabriel", formacao: "Contador. MBA em Data Science and Analytics", funcao: "Encarregado" },
      { nome: "Pedro", formacao: "Tecnólogo em Análise e Desenvolvimento de Sistemas", funcao: "Auxiliar" },
    ],
  },
  {
    id: "integracao", nome: "Integração de Novos Clientes",
    pessoas: [{ nome: "Kelly", formacao: "Contadora", funcao: "Líder" }],
  },
  {
    id: "manutencao", nome: "Manutenção, Copa e Cozinha",
    pessoas: [
      { nome: "Sra. Conceição", formacao: "Formada pela Escola da Vida", funcao: "Líder" },
      { nome: "Sr. Campos", formacao: "Eletricista", funcao: "Auxiliar" },
    ],
  },
];

export const TOTAL_PESSOAS =
  GESTORES.length + SETORES.reduce((s, x) => s + x.pessoas.length, 0);

export function iniciais(nome: string): string {
  const w = nome.replace(/^(Sra?\.|Dr a?\.)\s*/i, "").trim().split(/\s+/);
  return ((w[0]?.[0] || "") + (w[1]?.[0] || "")).toUpperCase();
}
