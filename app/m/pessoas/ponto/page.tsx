import Workspace from "@/components/Workspace";
import PontoFrame from "@/components/pessoas/PontoFrame";
import { PONTO_DIGITAL_URL } from "@/lib/pessoas/conteudos";

export default function PontoPage() {
  // Sem cabeçalho grande: o quadro do ponto usa toda a altura disponível.
  return (
    <Workspace moduleId="pessoas" appName="Ponto Digital">
      <PontoFrame url={PONTO_DIGITAL_URL} />
    </Workspace>
  );
}
