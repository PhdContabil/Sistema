"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadAll, nextLocalId, saveLocalProcesso } from "@/lib/societario/dataSource";
import type { SocietalActivity } from "@/lib/societario/tareffa";

function s(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export async function createProcessoAction(form: FormData): Promise<void> {
  const name = s(form, "name");
  if (!name) throw new Error("Nome da empresa é obrigatório");

  const snap = await loadAll();
  const tempId = nextLocalId(snap.processos);

  // Atividades vêm como pares atividade_nome_N / atividade_responsavel_N / atividade_prazo_N
  const activities: SocietalActivity[] = [];
  for (let i = 0; i < 20; i++) {
    const aName = s(form, `atividade_nome_${i}`);
    if (!aName) continue;
    activities.push({
      id: tempId * 100 + i,
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

  const savedId = await saveLocalProcesso({
    id: tempId,
    name,
    inscription: s(form, "inscription"),
    bearer: s(form, "bearer") || null,
    process: s(form, "process") || "Outro",
    status: s(form, "status") || "ACOMPANHAMENTO",
    started_in: s(form, "started_in") || new Date().toISOString().slice(0, 10),
    value,
    proposal: s(form, "proposal") || null,
    closed_in: null,
    updated_in: new Date().toISOString(),
    activities,
    source: "local",
    category: s(form, "category"),
    nextActivity: activities[0]?.name || "",
  });

  revalidatePath("/m/societario");
  revalidatePath("/m/societario/processos");
  redirect(`/m/societario/processos/${savedId}`);
}
