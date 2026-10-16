// Liga `enviarDocumentoSeguro` (lib/robo-zen/envio-seguro.ts, puro) ao mundo real:
// banco (reserva + registro de envios), SharePoint (baixar) e Questor Zen (subir
// e cadastrar). Usado igual pelo envio em lote e pela confirmação de uma empresa.

import { baixarConteudo, type ContextoGraph } from "./empresas-sharepoint";
import { importarDocumento, uploadArquivo } from "../questor-zen";
import * as dbz from "./db";
import type { DepsEnvioSeguro } from "./envio-seguro";

export interface ContextoEnvio {
  ctx: ContextoGraph;
  codigoCategoria: string;
  codigoCliente: string;
  empresa: { codigo: string; nome: string; cnpj: string };
  /** E-mail de quem está enviando (vai pro registro e pra reserva). */
  enviadoPor: string;
}

export function depsEnvioSeguro(c: ContextoEnvio): DepsEnvioSeguro {
  return {
    reservar: (codigo, nome) => dbz.reservarEnvio(codigo, nome, c.enviadoPor),
    jaRegistrado: async (codigo, nome) => (await dbz.enviosDaEmpresa(codigo)).some((e) => e.arquivo_nome === nome),
    liberarReserva: (codigo, nome) => dbz.liberarReservaEnvio(codigo, nome),
    baixar: (doc) => baixarConteudo(c.ctx, doc.id),
    subirArquivo: (nome, bytes) => uploadArquivo(nome, bytes),
    importar: ({ codigoArquivo, titulo }) =>
      importarDocumento({
        codigoCategoria: c.codigoCategoria,
        codigoCliente: c.codigoCliente,
        codigoArquivo,
        titulo,
      }),
    registrar: ({ arquivoNome, documentoId }) =>
      dbz.registrarEnvio({
        empresaCodigo: c.empresa.codigo,
        empresaNome: c.empresa.nome,
        cnpj: c.empresa.cnpj,
        arquivoNome,
        documentoIdQuestor: documentoId,
        codigoCategoriaQuestor: c.codigoCategoria,
        codigoClienteQuestor: c.codigoCliente,
        enviadoPor: c.enviadoPor,
      }),
  };
}
