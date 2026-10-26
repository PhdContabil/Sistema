"use server";

import { revalidatePath } from "next/cache";
import { salvarModelo, type ModeloAtividade } from "@/lib/societario/tipoAtividades";

export async function salvarAtividadesTipoAction(tipoId: string, itens: ModeloAtividade[]): Promise<void> {
  await salvarModelo(tipoId, itens);
  revalidatePath(`/m/societario/tipos-processo/${tipoId}`);
  revalidatePath("/m/societario/tipos-processo");
  revalidatePath("/m/societario/processos/novo");
}
