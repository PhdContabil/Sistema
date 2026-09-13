import Workspace from "@/components/Workspace";
import PainelBI from "@/components/apps/PainelBI";
import { MEI_PAINEL_URL } from "@/lib/mei";

export const dynamic = "force-dynamic";

export default function PainelMeiPage() {
  // Sem cabeçalho grande: o painel usa toda a altura disponível.
  return (
    <Workspace moduleId="mei" appName="Painel MEI">
      <PainelBI url={MEI_PAINEL_URL} titulo="Painel MEI" />
    </Workspace>
  );
}
