"use client";

import { useState, useTransition } from "react";
import type { TipoProcesso } from "@/lib/societario/tiposProcesso";

interface Props {
  tipos: TipoProcesso[];
  onCreate: (form: FormData) => Promise<void>;
  onUpdate: (form: FormData) => Promise<void>;
  onToggle: (id: string, active: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function TiposProcessoTable({
  tipos,
  onCreate,
  onUpdate,
  onToggle,
  onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSegment, setEditSegment] = useState("");
  const [, startTransition] = useTransition();
  const [novoOpen, setNovoOpen] = useState(false);

  function startEdit(t: TipoProcesso) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditSegment(t.segment || "Societário");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditSegment("");
  }

  async function saveEdit() {
    if (!editingId) return;
    const fd = new FormData();
    fd.set("id", editingId);
    fd.set("name", editName);
    fd.set("segment", editSegment);
    await onUpdate(fd);
    cancelEdit();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setNovoOpen((o) => !o)}
          className="bg-brand-700 hover:bg-brand-900 text-white text-sm font-medium rounded px-4 py-2"
        >
          {novoOpen ? "Cancelar" : "+ Adicionar tipo"}
        </button>
      </div>

      {novoOpen && (
        <form
          action={async (fd) => {
            await onCreate(fd);
            setNovoOpen(false);
          }}
          className="bg-white border border-brand-100 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
        >
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">
              Nome do tipo *
            </label>
            <input
              name="name"
              required
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              placeholder="Ex.: IBGE, Alteração - QSA..."
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Segmento
            </label>
            <input
              name="segment"
              defaultValue="Societário"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div className="sm:col-span-3 flex gap-2">
            <button
              type="submit"
              className="bg-brand-700 hover:bg-brand-900 text-white text-sm font-medium rounded px-4 py-1.5"
            >
              Adicionar
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600 text-xs uppercase">
            <tr>
              <th className="px-4 py-2.5 w-12">Ativo</th>
              <th className="px-4 py-2.5">Nome</th>
              <th className="px-4 py-2.5">Segmento</th>
              <th className="px-4 py-2.5 text-right w-32">Ações</th>
            </tr>
          </thead>
          <tbody>
            {tipos.map((t) => {
              const isEditing = editingId === t.id;
              return (
                <tr key={t.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      defaultChecked={t.active}
                      onChange={(e) =>
                        startTransition(() => {
                          onToggle(t.id, e.target.checked);
                        })
                      }
                      className="h-4 w-4 accent-brand-700"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    {isEditing ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    ) : (
                      <span className="font-medium">{t.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {isEditing ? (
                      <input
                        value={editSegment}
                        onChange={(e) => setEditSegment(e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    ) : (
                      t.segment || "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={saveEdit}
                          className="text-emerald-700 hover:text-emerald-900 text-sm"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-gray-500 hover:text-gray-700 text-sm"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => startEdit(t)}
                          className="text-brand-700 hover:text-brand-900 text-sm"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `Excluir o tipo "${t.name}"? Os processos existentes mantêm o nome.`
                              )
                            ) {
                              startTransition(() => {
                                onDelete(t.id);
                              });
                            }
                          }}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
