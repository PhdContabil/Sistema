"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  deleteLocalProcesso,
  updateActivitySituation,
  updateActivityObs,
} from "@/lib/societario/dataSource";

export async function updateActivityObsAction(processoId: number, activityId: number, obs: string): Promise<void> {
  await updateActivityObs(activityId, obs.trim().slice(0, 1000) || null);
  revalidatePath(`/m/societario/processos/${processoId}`);
}

export async function deleteAction(id: number): Promise<void> {
  await deleteLocalProcesso(id);
  revalidatePath("/m/societario/processos");
  revalidatePath("/m/societario");
  redirect("/m/societario/processos");
}

export async function updateActivityAction(
  processoId: number,
  activityId: number,
  situation: string
): Promise<void> {
  await updateActivitySituation(
    processoId,
    activityId,
    situation || null
  );
  revalidatePath(`/m/societario/processos/${processoId}`);
  revalidatePath("/m/societario/processos");
}
