import Workspace from "@/components/Workspace";
import Reunioes from "@/components/pessoas/Reunioes";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { lerReunioes, podeAgendar } from "@/lib/pessoas/reunioes";

export const dynamic = "force-dynamic";

export default async function ReunioesPage() {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase() ?? "";
  const pode = email ? (await podeAgendar(email)).ok : false;
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const todas = (await lerReunioes()).sort((a, b) => (a.data + a.hora_inicio).localeCompare(b.data + b.hora_inicio));
  const proximas = todas.filter((r) => r.data >= hoje);
  const passadas = todas.filter((r) => r.data < hoje).reverse().slice(0, 15);

  return (
    <Workspace moduleId="pessoas" appName="Reuniões">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: "oklch(0.62 0.13 200)" }}>RE</div>
        <div>
          <h1>Reuniões</h1>
          <div className="desc">Agenda de reuniões: data, local e horário.</div>
        </div>
      </div>
      <Reunioes proximas={proximas} passadas={passadas} podeAgendar={pode} />
    </Workspace>
  );
}
