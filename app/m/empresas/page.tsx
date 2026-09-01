import { unstable_noStore as semCache } from "next/cache";
import Link from "next/link";
import BuscaEmpresas from "@/components/apps/BuscaEmpresas";
import ThemeToggle from "@/components/ThemeToggle";
import { AvatarUsuario } from "@/components/UsuarioAtual";
import { listarEmpresas, type ItemSP } from "@/lib/empresas-sharepoint";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Busca de pastas de empresas no SharePoint.
 *
 * Fica fora dos módulos, como o Ponto Digital: é uma ferramenta usada por todo
 * o escritório, não de um departamento só. Por isso tem atalho na home.
 */
export default async function Page() {
  semCache();

  let driveId: string | null = null;
  let empresas: ItemSP[] = [];
  let erro: string | null = null;

  try {
    const r = await listarEmpresas();
    driveId = r.driveId;
    empresas = r.empresas;
  } catch (e) {
    erro = e instanceof Error ? e.message : "Falha ao consultar o SharePoint.";
  }

  return (
    <div className="launcher">
      <div className="topbar">
        <Link href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="brand-mark">N</span>
          <span>
            <span className="brand-name" style={{ display: "block" }}>Empresas</span>
            <span className="brand-sub mono">Pastas no SharePoint</span>
          </span>
        </Link>
        <div className="topbar-right">
          <Link className="btn" href="/">← Voltar ao painel</Link>
          <ThemeToggle />
          <AvatarUsuario />
        </div>
      </div>

      <div className="launcher-body">
        <div className="launcher-inner">
          <div className="eyebrow">Ferramentas do escritório</div>
          <h1>Empresas</h1>
          <p className="lead">
            Encontre rapidamente a pasta de qualquer empresa e navegue nos documentos.
          </p>

          <BuscaEmpresas driveId={driveId} empresas={empresas} erroServidor={erro} />
        </div>
      </div>
    </div>
  );
}
