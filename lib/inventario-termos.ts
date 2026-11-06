// Termo de Responsabilidade e Uso de Equipamento (empréstimo de notebook da PHD).
// A T.I. gera o termo pelo Inventário; a pessoa assina por um link (sem login, por token secreto);
// o termo assinado fica guardado e o equipamento passa a ficar atrelado a ela no inventário.
// Guardado como JSON no bucket privado "cache-nucleo" do Supabase (sem tabela nova).
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";

export type StatusTermo = "pendente" | "assinado" | "cancelado" | "devolvido";

export interface Equipamento {
  item_id: number;
  item: string;
  marca: string | null;
  especificacao: string | null;
  observacao: string | null; // nº de série / patrimônio / nome do PC (informado no termo)
}

export interface Termo {
  id: number;
  token: string;
  status: StatusTermo;
  equipamento: Equipamento;
  acessorios: string | null; // ex.: carregador, mouse, mochila
  condicao: string | null; // estado do equipamento na entrega
  colaborador: { nome: string; email: string | null; setor: string | null; cpf: string | null; pessoa_id: number | null };
  data_entrega: string; // AAAA-MM-DD
  devolucao_prevista: string | null;
  criado_por: string;
  criado_em: string;
  assinatura: {
    nome: string;
    cpf: string;
    imagem: string; // data:image/png;base64 (assinatura desenhada)
    em: string;
    ip: string | null;
    navegador: string | null;
    hash_texto: string; // SHA-256 do texto do termo aceito
  } | null;
  devolvido_em: string | null;
  devolucao_obs: string | null;
}

const BUCKET = "cache-nucleo";
const ARQ = "inventario-termos.json";

export function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function lerTermos(): Promise<Termo[]> {
  const c = sb();
  if (!c) return [];
  const { data, error } = await c.storage.from(BUCKET).download(ARQ);
  if (error || !data) return [];
  try { return JSON.parse(await data.text()) as Termo[]; } catch { return []; }
}

export async function salvarTermos(lista: Termo[]): Promise<string | null> {
  const c = sb();
  if (!c) return "Banco indisponível.";
  const { error } = await c.storage.from(BUCKET)
    .upload(ARQ, new Blob([JSON.stringify(lista)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  return error ? error.message : null;
}

export const novoToken = () => randomBytes(24).toString("hex");

export function dataBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Texto do termo (o mesmo que a pessoa lê e aceita; o hash dele vai junto com a assinatura). */
export function textoTermo(t: Pick<Termo, "equipamento" | "acessorios" | "condicao" | "colaborador" | "data_entrega" | "devolucao_prevista">): string[] {
  const eq = t.equipamento;
  const desc = [eq.item, eq.marca, eq.especificacao].filter(Boolean).join(" — ");
  return [
    `Pelo presente termo, eu, ${t.colaborador.nome}${t.colaborador.setor ? `, do setor ${t.colaborador.setor}` : ""}, declaro ter recebido da PHD CONTÁBIL, em ${dataBR(t.data_entrega)}, a título de empréstimo e exclusivamente para uso nas atividades profissionais, o equipamento abaixo, em perfeito estado de funcionamento${t.condicao ? ` (condição na entrega: ${t.condicao})` : ""}:`,
    `Equipamento: ${desc}${eq.observacao ? ` · Identificação: ${eq.observacao}` : ""}${t.acessorios ? ` · Acessórios: ${t.acessorios}` : ""}.`,
    "1. USO — O equipamento é de propriedade da empresa e deve ser usado apenas para o trabalho. Não é permitido emprestá-lo, cedê-lo ou permitir seu uso por terceiros, nem utilizá-lo para fins pessoais, ilegais ou contrários às políticas internas.",
    "2. SOFTWARE E CONFIGURAÇÕES — Não instalar programas, alterar configurações de segurança, remover o antivírus ou formatar o equipamento sem autorização da T.I. Atualizações e manutenções são feitas pela T.I.",
    "3. INFORMAÇÕES E SIGILO — Os dados da empresa e de seus clientes armazenados ou acessados pelo equipamento são confidenciais e protegidos pela LGPD (Lei nº 13.709/2018). Comprometo-me a manter senhas em sigilo, bloquear a tela quando me afastar e não copiar dados para dispositivos ou contas pessoais.",
    "4. GUARDA E CONSERVAÇÃO — Sou responsável pela guarda e conservação do equipamento, inclusive no transporte e fora da empresa, evitando deixá-lo exposto em veículos ou locais públicos, longe de líquidos, alimentos, calor e impactos.",
    "5. DANOS, PERDA OU FURTO — Devo comunicar imediatamente à T.I. qualquer defeito, dano, perda, furto ou roubo. Em caso de furto ou roubo, devo apresentar o Boletim de Ocorrência. Danos causados por mau uso, negligência ou dolo poderão ser ressarcidos por mim, inclusive por desconto em folha, conforme o art. 462, § 1º, da CLT, ficando autorizado por este termo. O desgaste natural pelo uso normal não gera responsabilidade.",
    "6. MONITORAMENTO E INSPEÇÃO — Estou ciente de que o equipamento e os sistemas corporativos podem ser inspecionados, monitorados e acessados remotamente pela T.I. para segurança, suporte e cumprimento das políticas da empresa.",
    `7. DEVOLUÇÃO — Devolverei o equipamento e os acessórios, no estado em que os recebi (salvo desgaste natural), ${t.devolucao_prevista ? `até ${dataBR(t.devolucao_prevista)}, ` : ""}quando solicitado pela empresa ou no desligamento, o que ocorrer primeiro.`,
    "Declaro que li, entendi e concordo com todas as condições deste Termo de Responsabilidade e Uso de Equipamento.",
  ];
}

export function hashTexto(linhas: string[]): string {
  return createHash("sha256").update(linhas.join("\n")).digest("hex");
}

/** O que o link público pode ver (sem dados de outros termos nem de quem gerou). */
export function publico(t: Termo) {
  return {
    status: t.status,
    equipamento: { item: t.equipamento.item, marca: t.equipamento.marca, especificacao: t.equipamento.especificacao, observacao: t.equipamento.observacao },
    acessorios: t.acessorios, condicao: t.condicao, colaborador: t.colaborador, data_entrega: t.data_entrega, devolucao_prevista: t.devolucao_prevista,
    texto: textoTermo(t),
    assinatura: t.assinatura ? { nome: t.assinatura.nome, cpf: t.assinatura.cpf, imagem: t.assinatura.imagem, em: t.assinatura.em, hash_texto: t.assinatura.hash_texto } : null,
  };
}
