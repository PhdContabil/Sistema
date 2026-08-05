import { redirect } from "next/navigation";
import Workspace from "@/components/Workspace";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/** Descobre o perfil da pessoa logada (pelo e-mail) e abre a edição. */
export default async function MeuPerfil() {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();

  if (email) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
      const sb = createClient(url, key, { auth: { persistSession: false } });
      const { data } = await sb
        .from("pessoas_perfil")
        .select("slug")
        .ilike("email", email)
        .maybeSingle();
      if (data?.slug) redirect(`/m/pessoas/perfil/${data.slug}/editar`);
    }
  }

  return (
    <Workspace moduleId="pessoas" appName="Meu perfil">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: "oklch(0.62 0.13 150)" }}>MP</div>
        <div>
          <h1>Meu perfil</h1>
          <div className="desc">Seu espaço no Núcleo Contábil.</div>
        </div>
      </div>
      <div className="banner">
        <strong>Não encontramos um cadastro vinculado ao seu e-mail{email ? ` (${email})` : ""}.</strong>
        <p style={{ margin: "6px 0 0" }}>
          Peça ao time de Tecnologia para vincular seu e-mail ao seu cadastro em Pessoas —
          depois disso esta tela abre direto no formulário de edição.
        </p>
      </div>
    </Workspace>
  );
}
