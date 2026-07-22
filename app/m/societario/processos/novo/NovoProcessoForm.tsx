"use client";

import { useState } from "react";
import { RESPONSAVEIS, STATUS_PROCESSO } from "@/lib/societario/options";

interface Atividade {
  nome: string;
  responsavel: string;
  prazo: string;
  situacao: string;
}

const ATIVIDADE_VAZIA: Atividade = {
  nome: "",
  responsavel: "",
  prazo: "",
  situacao: "",
};

export function NovoProcessoForm({
  action,
  tipos,
}: {
  action: (data: FormData) => Promise<void>;
  tipos: string[];
}) {
  const [atividades, setAtividades] = useState<Atividade[]>([
    { ...ATIVIDADE_VAZIA },
  ]);

  function updateAtividade(i: number, patch: Partial<Atividade>) {
    setAtividades((cur) =>
      cur.map((a, idx) => (idx === i ? { ...a, ...patch } : a))
    );
  }

  function addAtividade() {
    setAtividades((cur) => [...cur, { ...ATIVIDADE_VAZIA }]);
  }

  function removeAtividade(i: number) {
    setAtividades((cur) => cur.filter((_, idx) => idx !== i));
  }

  return (
    <form action={action} className="space-y-6">
      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h2 className="font-semibold">Dados da empresa</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Razão social / Nome do cliente *" required>
            <input
              name="name"
              required
              className="form-input"
              placeholder="Ex.: ACME LTDA"
            />
          </Field>
          <Field label="CNPJ / CPF">
            <input
              name="inscription"
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
            <select name="process" required className="form-input">
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" className="form-input" defaultValue="ACOMPANHAMENTO">
              {STATUS_PROCESSO.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsável / Parceiro">
            <select name="bearer" className="form-input" defaultValue="">
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
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label="Valor (R$)">
            <input
              type="number"
              step="0.01"
              name="value"
              className="form-input"
              placeholder="0,00"
            />
          </Field>
          <Field label="Proposta">
            <input name="proposal" className="form-input" placeholder="000000.2026" />
          </Field>
        </div>
        <Field label="Categoria / observações">
          <textarea
            name="category"
            rows={2}
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
              <div className="sm:col-span-4">
                <label className="block text-xs text-gray-500 mb-1">
                  Atividade #{i + 1}
                </label>
                <input
                  value={a.nome}
                  onChange={(e) => updateAtividade(i, { nome: e.target.value })}
                  className="form-input"
                  placeholder="Ex.: Coletar documentos"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs text-gray-500 mb-1">
                  Responsável
                </label>
                <input
                  value={a.responsavel}
                  onChange={(e) =>
                    updateAtividade(i, { responsavel: e.target.value })
                  }
                  className="form-input"
                />
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
                  {STATUS_PROCESSO.map((s) => (
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
        <button
          type="submit"
          className="bg-brand-700 hover:bg-brand-900 text-white text-sm font-semibold rounded px-5 py-2"
        >
          Salvar processo
        </button>
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
