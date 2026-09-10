// Script pontual (não faz parte do app) — gera um relatório de quem tem
// acesso a quê, módulo por módulo e submódulo por submódulo, junto com o
// setor de cada pessoa. Pedido do Pedro em 09/09/2026.
//
// Roda direto com tsx, sem precisar do servidor Next.js de pé:
//   npx tsx scripts/relatorio-acessos.ts > relatorio-acessos.json
//
// Lê as mesmas variáveis de .env.local que o app usa (service role do
// Supabase), então só funciona local, na máquina de quem tem o .env.local.

import { readFileSync } from "fs";
import { resolve } from "path";

// Carrega .env.local manualmente (sem depender do pacote dotenv, que não é
// dependência do projeto) — parser simples de KEY=VALUE por linha.
function carregarEnvLocal() {
  const caminho = resolve(__dirname, "../.env.local");
  const texto = readFileSync(caminho, "utf8");
  for (const linha of texto.split("\n")) {
    const l = linha.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i === -1) continue;
    const chave = l.slice(0, i).trim();
    let valor = l.slice(i + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    if (!(chave in process.env)) process.env[chave] = valor;
  }
}
carregarEnvLocal();

// Diretoria tem acesso total por e-mail fixo (lib/acesso.ts), sem precisar
// estar cadastrada em ticket_users — mas pra sair no relatório junto com todo
// mundo, entram aqui manualmente com o nome usado na Hierarquia (lib/pessoas/equipe.ts).
const NOME_DIRETORIA: Record<string, string> = {
  "edcarlos@phdcontabil.com.br": "Ed Carlos",
  "eduardo@phdcontabil.com.br": "Eduardo",
  "junior@phdcontabil.com.br": "Júnior",
};

async function main() {
  const { listarPessoas } = await import("../lib/tickets");
  const { MODULES } = await import("../lib/modules");
  const { obterNivelAcesso, podeAcessarModulo, podeAcessarApp, podeAcessarAppTecnologia, DIRETORIA_EMAILS } = await import("../lib/acesso");

  const pessoasBanco = await listarPessoas();

  // Completa com quem é diretoria mas não está em ticket_users (não tem setor
  // lá — o acesso total vem só do e-mail estar na lista fixa).
  const emailsBanco = new Set(pessoasBanco.map((p) => p.email.toLowerCase()));
  const diretoriaFaltando = DIRETORIA_EMAILS.filter((e) => !emailsBanco.has(e.toLowerCase())).map((email) => ({
    email,
    name: NOME_DIRETORIA[email] ?? email.split("@")[0],
    sector: "diretoria",
    is_sub_admin: false,
  }));

  const pessoas = [...pessoasBanco, ...diretoriaFaltando];

  const relatorio = await Promise.all(
    pessoas.map(async (p) => {
      const nivel = await obterNivelAcesso(p.email);
      const modulos = MODULES.map((m) => {
        const moduloLiberado = podeAcessarModulo(nivel, m.id);
        const overrideModulo = nivel.overridesModulos[m.id] ?? null;
        const apps = m.apps.map((a) => {
          const liberado = m.id === "tecnologia"
            ? podeAcessarAppTecnologia(nivel, a.href)
            : podeAcessarApp(nivel, m.id, a.name);
          const overrideApp = nivel.overridesApps[m.id]?.[a.name] ?? null;
          return { nome: a.name, liberado, override: overrideApp };
        });
        return { id: m.id, nome: m.name, liberado: moduloLiberado, override: overrideModulo, apps };
      });
      return {
        email: p.email,
        nome: p.name,
        setor: p.sector,
        is_sub_admin: p.is_sub_admin,
        diretoria: nivel.diretoria,
        ti: nivel.ti,
        acessoTotal: nivel.acessoTotal,
        modulos,
      };
    })
  );

  process.stdout.write(JSON.stringify({ pessoas: relatorio }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
