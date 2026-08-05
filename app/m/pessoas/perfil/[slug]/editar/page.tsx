import Workspace from "@/components/Workspace";
import EditarPerfil from "@/components/pessoas/EditarPerfil";

export default function Page({ params }: { params: { slug: string } }) {
  return (
    <Workspace moduleId="pessoas" appName="Editar perfil">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: "oklch(0.62 0.13 150)" }}>EP</div>
        <div>
          <h1>Editar meu perfil</h1>
          <div className="desc">Atualize seu histórico, seus gostos e sua foto.</div>
        </div>
      </div>
      <EditarPerfil slug={params.slug} />
    </Workspace>
  );
}
