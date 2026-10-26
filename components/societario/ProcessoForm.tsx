"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { RESPONSAVEIS, STATUS_PROCESSO, SITUACOES_ATIVIDADE } from "@/lib/societario/options";
import type { UnifiedProcesso } from "@/lib/societario/dataSource";
import type { ModeloAtividade } from "@/lib/societario/tipoAtividades";

interface EmpresaQ { codigo: number; nome: string; doc: string; ativa: boolean }

/** CPF (11) ou CNPJ (14) formatado; nunca passa de 14 dígitos. */
export function formatarDoc(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/** Soma dias úteis (pula sábado e domingo). */
function somarDiasUteis(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  let n = Math.max(0, dias);
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) n--;
  }
  return d.toISOString().slice(0, 10);
}

function atividadesDoModelo(modelo: ModeloAtividade[], inicio: string): Atividade[] {
  let base = inicio || new Date().toISOString().slice(0, 10);
  return modelo.map((m) => {
    base = somarDiasUteis(base, m.dias || 0) || base;
    return { nome: m.nome, responsavel: m.responsavel || "", coresponsavel: m.coresponsavel || "", prazo: m.dias ? base : "", situacao: "", obs: m.obs || "" };
  });
}

interface Atividade {
  id?: number;
  nome: string;
  responsavel: string;
  prazo: string;
  situacao: string;
  obs?: string;
  coresponsavel?: string;
}

const ATIVIDADE_VAZIA: Atividade = {
  nome: "",
  responsavel: "",
  prazo: "",
  situacao: "",
};

interface Props {
  action: (data: FormData) => Promise<void>;
  tipos: string[];
  initial?: UnifiedProcesso;
  submitLabel?: string;
  /** Atividades-modelo por NOME do tipo de processo (Cadastros > Tipos de processo). */
  modelos?: Record<string, ModeloAtividade[]>;
}

export function ProcessoForm({
  action,
  tipos,
  initial,
  submitLabel = "Salvar processo",
  modelos = {},
}: Props) {
  const [tipo, setTipo] = useState(initial?.process || tipos[0] || "");
  const [inicio, setInicio] = useState(initial?.started_in || new Date().toISOString().slice(0, 10));
  const [razao, setRazao] = useState(initial?.name || "");
  const [externo, setExterno] = useState("");
  const [doc, setDoc] = useState(formatarDoc(initial?.inscription || ""));
  const [empresas, setEmpresas] = useState<EmpresaQ[] | null>(null);
  const [buscaAberta, setBuscaAberta] = useState(false);

  async function carregarEmpresas() {
    if (empresas) return;
    try {
      const r = await fetch("/api/societario/empresas");
      const j = await r.json();
      setEmpresas(r.ok ? j.itens ?? [] : []);
    } catch { setEmpresas([]); }
  }
  const achadas = useMemo(() => {
    const q = razao.trim().toLowerCase();
    const qd = razao.replace(/\D/g, "");
    if (!empresas || q.length < 2) return [];
    return empresas
      .filter((e) => e.nome.toLowerCase().includes(q) || String(e.codigo) === q || (qd.length >= 3 && e.doc.includes(qd)))
      .slice(0, 15);
  }, [empresas, razao]);

  // Processo novo: ao trocar o tipo (ou a data de início), carrega as atividades vinculadas ao tipo.
  const [mexeuAtividades, setMexeuAtividades] = useState(false);
  useEffect(() => {
    if (initial || mexeuAtividades) return;
    const m = modelos[tipo];
    if (m && m.length) setAtividades(atividadesDoModelo(m, inicio));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, inicio]);

  const [atividades, setAtividades] = useState<Atividade[]>(() => {
    if (initial && initial.activities.length > 0) {
      return initial.activities.map((a) => ({
        id: a.id,
        nome: a.name,
        responsavel: a.responsible || "",
        coresponsavel: a.co_responsible || "",
        prazo: a.deadline_in || "",
        situacao: a.situation || "",
      }));
    }
    const m = modelos[initial?.process || tipos[0] || ""];
    if (m && m.length) return atividadesDoModelo(m, new Date().toISOString().slice(0, 10));
    return [{ ...ATIVIDADE_VAZIA }];
  });

  function trocarTipo(novo: string) {
    if (!initial && mexeuAtividades && modelos[novo]?.length &&
      confirm("Trocar as atividades pelas do tipo escolhido? As que você alterou serão substituídas.")) {
      setMexeuAtividades(false);
      setAtividades(atividadesDoModelo(modelos[novo], inicio));
    }
    setTipo(novo);
  }

  function updateAtividade(i: number, patch: Partial<Atividade>) {
    setMexeuAtividades(true);
    setAtividades((cur) =>
      cur.map((a, idx) => (idx === i ? { ...a, ...patch } : a))
    );
  }

  function addAtividade() {
    setMexeuAtividades(true);
    setAtividades((cur) => [...cur, { ...ATIVIDADE_VAZIA }]);
  }

  function removeAtividade(i: number) {
    setMexeuAtividades(true);
    setAtividades((cur) => cur.filter((_, idx) => idx !== i));
  }

  return (
    <form action={action} className="space-y-6">
      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h2 className="font-semibold">Dados da empresa</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input type="hidden" name="name" value={(externo.trim() || razao.trim())} />
          <Field label="Razão social (empresa do Questor)">
            <div className="relative">
              <input
                value={razao}
                required={!externo.trim()}
                onFocus={() => { carregarEmpresas(); setBuscaAberta(true); }}
                onBlur={() => setTimeout(() => setBuscaAberta(false), 150)}
                onChange={(e) => { setRazao(e.target.value); setBuscaAberta(true); }}
                className="form-input"
                placeholder="Digite nome, código ou CNPJ para buscar"
                disabled={!!externo.trim()}
              />
              {buscaAberta && achadas.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow max-h-64 overflow-auto">
                  {achadas.map((e) => (
                    <button
                      type="button"
                      key={e.codigo}
                      onMouseDown={() => { setRazao(e.nome); setDoc(formatarDoc(e.doc)); setBuscaAberta(false); }}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <b>{e.codigo}</b> - {e.nome}
                      <span className="text-gray-500"> · {formatarDoc(e.doc)}{e.ativa ? "" : " · inativa"}</span>
                    </button>
                  ))}
                </div>
              )}
              {buscaAberta && empresas === null && razao.trim().length >= 2 && (
                <p className="text-xs text-gray-500 mt-1">Carregando empresas do Questor…</p>
              )}
            </div>
          </Field>
          <Field label="Cliente externo (quem não é empresa do Questor)">
            <input
              value={externo}
              onChange={(e) => setExterno(e.target.value)}
              className="form-input"
              placeholder="Preencha só se não for empresa cadastrada"
            />
          </Field>
          <Field label="CNPJ / CPF">
            <input
              name="inscription"
              value={doc}
              onChange={(e) => setDoc(formatarDoc(e.target.value))}
              inputMode="numeric"
              maxLength={18}
              className="form-input"
              placeholder="00.000.000/0000-00"
            />
          </Field>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h2 className="font-semibold">Dados do processo</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Tipo de processo *" required>
            <select
              name="process"
              required
              value={tipo}
              onChange={(e) => trocarTipo(e.target.value)}
              className="form-input"
            >
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              name="status"
              defaultValue={initial?.status || "ACOMPANHAMENTO"}
              className="form-input"
            >
              {STATUS_PROCESSO.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsável / Parceiro">
            <select
              name="bearer"
              defaultValue={initial?.bearer || ""}
              className="form-input"
            >
              <option value="">(nenhum)</option>
              {RESPONSAVEIS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data de início">
            <input
              type="date"
              name="started_in"
              className="form-input"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </Field>
          <Field label="Valor (R$)">
            <input
              type="number"
              step="0.01"
              name="value"
              className="form-input"
              defaultValue={initial?.value ?? ""}
              placeholder="0,00"
            />
          </Field>
          <Field label="Proposta">
            <input
              name="proposal"
              defaultValue={initial?.proposal || ""}
              className="form-input"
              placeholder="000000.2026"
            />
          </Field>
        </div>
        <Field label="Categoria / observações">
          <textarea
            name="category"
            rows={2}
            defaultValue={initial?.category || ""}
            className="form-input"
            placeholder="Detalhes adicionais"
          />
        </Field>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Atividades</h2>
          <button
            type="button"
            onClick={addAtividade}
            className="text-sm text-brand-700 hover:text-brand-900"
          >
            + Adicionar atividade
          </button>
        </div>
        {atividades.length === 0 && (
          <p className="text-sm text-gray-500">Nenhuma atividade.</p>
        )}
        <div className="space-y-3">
          {atividades.map((a, i) => (
            <div
              key={i}
              className="border border-gray-200 rounded-lg p-3 bg-gray-50 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
            >
              <input type="hidden" name={`atividade_nome_${i}`} value={a.nome} />
              <input
                type="hidden"
                name={`atividade_responsavel_${i}`}
                value={a.responsavel}
              />
              <input type="hidden" name={`atividade_coresponsavel_${i}`} value={a.coresponsavel || ""} />
              <input
                type="hidden"
                name={`atividade_prazo_${i}`}
                value={a.prazo}
              />
              <input
                type="hidden"
                name={`atividade_situacao_${i}`}
                value={a.situacao}
              />
              {a.id && (
                <input
                  type="hidden"
                  name={`atividade_id_${i}`}
                  value={a.id}
                />
              )}
              <div className="sm:col-span-3">
                <label className="block text-xs text-gray-500 mb-1">
                  Atividade #{i + 1}
                </label>
                <input
                  value={a.nome}
                  onChange={(e) => updateAtividade(i, { nome: e.target.value })}
                  className="form-input"
                  placeholder="Ex.: Coletar documentos"
                />
                {a.obs && <p className="text-xs text-gray-500 mt-1">{a.obs}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">
                  Responsável
                </label>
                <select
                  value={a.responsavel}
                  onChange={(e) =>
                    updateAtividade(i, { responsavel: e.target.value })
                  }
                  className="form-input"
                >
                  <option value="">(nenhum)</option>
                  {RESPONSAVEIS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">
                  Corresponsável
                </label>
                <select
                  value={a.coresponsavel || ""}
                  onChange={(e) => updateAtividade(i, { coresponsavel: e.target.value })}
                  className="form-input"
                >
                  <option value="">(nenhum)</option>
                  {RESPONSAVEIS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">
                  Prazo
                </label>
                <input
                  type="date"
                  value={a.prazo}
                  onChange={(e) => updateAtividade(i, { prazo: e.target.value })}
                  className="form-input"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">
                  Situação
                </label>
                <select
                  value={a.situacao}
                  onChange={(e) =>
                    updateAtividade(i, { situacao: e.target.value })
                  }
                  className="form-input"
                >
                  <option value="">—</option>
                  {SITUACOES_ATIVIDADE.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => removeAtividade(i)}
                  className="text-red-600 hover:text-red-800 text-sm"
                  title="Remover"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <a
          href="/m/societario/processos"
          className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2"
        >
          Cancelar
        </a>
        <BotaoSalvar label={submitLabel} />
      </div>

      <style jsx global>{`
        .form-input {
          display: block;
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 14px;
          background: white;
        }
        .form-input:focus {
          outline: none;
          border-color: #7c3aed;
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.15);
        }
      `}</style>
    </form>
  );
}

/** Fica desabilitado enquanto salva: evita criar o processo duas vezes com clique duplo. */
function BotaoSalvar({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brand-700 hover:bg-brand-900 text-white text-sm font-semibold rounded px-5 py-2 disabled:opacity-50"
    >
      {pending ? "Salvando…" : label}
    </button>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">
        {label}
        {required && <span className="text-red-500"> </span>}
      </label>
      {children}
    </div>
  );
}
