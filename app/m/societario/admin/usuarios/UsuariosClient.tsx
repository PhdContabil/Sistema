"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Usuario, UsuarioRole } from "@/lib/societario/usuarios";

interface Props {
  usuariosIniciais: Usuario[];
  /** Emails que são admins hardcoded (não podem ser desativados nem deletados). */
  adminEmails: string[];
}

function roleLabel(r: UsuarioRole): string {
  if (r === "dev") return "Desenvolvedor";
  if (r === "admin") return "Administrador";
  return "Colaborador";
}

function roleBadgeClass(r: UsuarioRole): string {
  if (r === "dev") return "text-xs font-semibold text-purple-700 bg-purple-50 rounded px-2 py-0.5";
  if (r === "admin") return "text-xs font-semibold text-brand-700 bg-brand-50 rounded px-2 py-0.5";
  return "text-xs text-gray-600";
}

export function UsuariosClient({ usuariosIniciais, adminEmails }: Props) {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<Usuario[]>(usuariosIniciais);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<UsuarioRole>("user");
  const [novoOpen, setNovoOpen] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const adminSet = new Set(adminEmails);

  function isLockedRow(u: Usuario): boolean {
    return adminSet.has(u.email.toLowerCase());
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function reload() {
    const r = await fetch("/api/societario/admin/usuarios", { cache: "no-store" });
    if (r.ok) {
      const data = await r.json();
      setUsuarios(data.usuarios || []);
    }
  }

  async function handleCreate(fd: FormData) {
    setErro(null);
    const payload = {
      email: String(fd.get("email") || "").trim(),
      name: String(fd.get("name") || "").trim() || null,
      role: (fd.get("role") || "user") as UsuarioRole,
      active: true,
    };
    if (!payload.email) {
      setErro("Email é obrigatório");
      return;
    }
    const r = await fetch("/api/societario/admin/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setErro(data.error || "Falha ao criar usuário");
      return;
    }
    setNovoOpen(false);
    await reload();
    refresh();
  }

  function startEdit(u: Usuario) {
    setEditingId(u.id);
    setEditName(u.name || "");
    setEditEmail(u.email);
    setEditRole(u.role);
    setErro(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditEmail("");
    setEditRole("user");
  }

  async function saveEdit(id: number) {
    setErro(null);
    const r = await fetch(`/api/societario/admin/usuarios/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: editEmail.trim(),
        name: editName.trim() || null,
        role: editRole,
      }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setErro(data.error || "Falha ao salvar");
      return;
    }
    cancelEdit();
    await reload();
    refresh();
  }

  async function toggleActive(u: Usuario) {
    setErro(null);
    const r = await fetch(`/api/societario/admin/usuarios/${u.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !u.active }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setErro(data.error || "Falha ao alterar status");
      return;
    }
    await reload();
    refresh();
  }

  async function deleteUser(u: Usuario) {
    if (!confirm(`Remover ${u.email}?`)) return;
    setErro(null);
    const r = await fetch(`/api/societario/admin/usuarios/${u.id}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setErro(data.error || "Falha ao remover");
      return;
    }
    await reload();
    refresh();
  }

  return (
    <div className="space-y-4">
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">
          {erro}
        </div>
      )}

      {/* Legenda dos papéis */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 space-y-1">
        <div><span className="font-semibold text-purple-700">Desenvolvedor:</span> acesso total ao sistema.</div>
        <div><span className="font-semibold text-brand-700">Administrador:</span> cria/edita/exclui processos e cadastra usuários.</div>
        <div><span className="font-semibold">Colaborador:</span> apenas visualiza dados (não vê Administração nem Tipos de processo).</div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => {
            setNovoOpen((o) => !o);
            setErro(null);
          }}
          className="bg-brand-700 hover:bg-brand-900 text-white text-sm font-medium rounded px-4 py-2"
        >
          {novoOpen ? "Cancelar" : "+ Adicionar usuário"}
        </button>
      </div>

      {novoOpen && (
        <form
          action={handleCreate}
          className="bg-white border border-brand-100 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
        >
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email *</label>
            <input
              name="email"
              type="email"
              required
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              placeholder="usuario@phdcontabil.com.br"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nome</label>
            <input
              name="name"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              placeholder="Nome do usuário"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Papel</label>
            <select
              name="role"
              defaultValue="user"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="user">Colaborador</option>
              <option value="admin">Administrador</option>
              <option value="dev">Desenvolvedor</option>
            </select>
          </div>
          <div>
            <button
              type="submit"
              className="w-full bg-brand-700 hover:bg-brand-900 text-white text-sm font-medium rounded px-4 py-1.5"
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
              <th className="px-4 py-2.5 w-16">Ativo</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Nome</th>
              <th className="px-4 py-2.5 w-36">Papel</th>
              <th className="px-4 py-2.5 text-right w-44">Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const isEditing = editingId === u.id;
              const locked = isLockedRow(u);
              return (
                <tr key={u.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={u.active}
                      disabled={locked || pending}
                      onChange={() => toggleActive(u)}
                      title={
                        locked
                          ? "Administrador principal não pode ser desativado"
                          : ""
                      }
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    {isEditing ? (
                      <input
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    ) : (
                      <span className={!u.active ? "text-gray-400" : ""}>
                        {u.email}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {isEditing ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                        placeholder="Nome"
                      />
                    ) : (
                      <span className={!u.active ? "text-gray-400" : ""}>
                        {u.name || "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {isEditing ? (
                      <select
                        value={editRole}
                        onChange={(e) =>
                          setEditRole(e.target.value as UsuarioRole)
                        }
                        disabled={locked}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      >
                        <option value="user">Colaborador</option>
                        <option value="admin">Administrador</option>
                        <option value="dev">Desenvolvedor</option>
                      </select>
                    ) : (
                      <span className={roleBadgeClass(u.role)}>
                        {roleLabel(u.role)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right space-x-2">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => saveEdit(u.id)}
                          className="text-xs bg-brand-700 hover:bg-brand-900 text-white rounded px-3 py-1"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-xs text-gray-600 hover:text-gray-900"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(u)}
                          className="text-xs text-brand-700 hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => deleteUser(u)}
                          disabled={locked}
                          className="text-xs text-red-600 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
                          title={
                            locked
                              ? "Administrador principal não pode ser removido"
                              : ""
                          }
                        >
                          Remover
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {usuarios.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-gray-500 text-sm"
                >
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
