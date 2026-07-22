"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { updateLocalProcesso } from "@/lib/societario/dataSource";
import type { SocietalActivity } from "@/lib/societario/tareffa";

function s(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export async function updateProcessoAction(
  id: number,
  form: FormData
): Promise<void> {
  const name = s(form, "name");
  if (!name) throw new Error("Nome da empresa é obrigatório");

  const activities: SocietalActivity[] = [];
  for (let i = 0; i < 40; i++) {
    const aName = s(form, `atividade_nome_${i}`);
    if (!aName) continue;
    const aid = s(form, `atividade_id_${i}`);
    activities.push({
      id: aid ? Number(aid) : id * 100 + i,
      name: aName,
      responsible: s(form, `atividade_responsavel_${i}`) || null,
      situation: s(form, `atividade_situacao_${i}`) || null,
      situation_in: null,
      order: String(i + 1).padStart(3, "0"),
      closed_in: null,
      deadline_in: s(form, `atividade_prazo_${i}`) || null,
      updated_in: new Date().toISOString(),
    });
  }

  const valueRaw = s(form, "value");
  const value =
    valueRaw && !Number.isNaN(Number(valueRaw)) ? Number(valueRaw) : null;

  await updateLocalProcesso(id, {
    name,
    inscription: s(form, "inscription"),
    bearer: s(form, "bearer") || null,
    process: s(form, "process") || "Outro",
    status: s(form, "status") || "ACOMPANHAMENTO",
    started_in: s(form, "started_in") || new Date().toISOString().slice(0, 10),
    value,
    proposal: s(form, "proposal") || null,
    updated_in: new Date().toISOString(),
    activities,
    category: s(form, "category"),
  });

  revalidatePath("/m/societario");
  revalidatePath("/m/societario/processos");
  revalidatePath(`/m/societario/processos/${id}`);
  redirect(`/m/societario/processos/${id}`);
}
