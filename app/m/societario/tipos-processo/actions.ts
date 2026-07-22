"use server";

import { revalidatePath } from "next/cache";
import {
  createTipo,
  deleteTipo,
  updateTipo,
} from "@/lib/societario/tiposProcesso";

export async function createTipoAction(form: FormData): Promise<void> {
  const name = String(form.get("name") || "").trim();
  if (!name) return;
  const segment = String(form.get("segment") || "Societário").trim();
  await createTipo({ name, segment, active: true });
  revalidatePath("/m/societario/tipos-processo");
  revalidatePath("/m/societario/processos");
  revalidatePath("/m/societario/processos/novo");
}

export async function updateTipoAction(form: FormData): Promise<void> {
  const id = String(form.get("id") || "");
  if (!id) return;
  const name = String(form.get("name") || "").trim();
  const segment = String(form.get("segment") || "").trim();
  await updateTipo(id, { name, segment });
  revalidatePath("/m/societario/tipos-processo");
}

export async function toggleAtivoAction(
  id: string,
  active: boolean
): Promise<void> {
  await updateTipo(id, { active });
  revalidatePath("/m/societario/tipos-processo");
  revalidatePath("/m/societario/processos");
  revalidatePath("/m/societario/processos/novo");
}

export async function deleteTipoAction(id: string): Promise<void> {
  await deleteTipo(id);
  revalidatePath("/m/societario/tipos-processo");
  revalidatePath("/m/societario/processos");
  revalidatePath("/m/societario/processos/novo");
}
