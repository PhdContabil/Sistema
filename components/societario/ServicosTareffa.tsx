import type { ResultadoServico } from "@/lib/societario/tareffaServicos";

/** Serviços criados no Tareffa a partir deste processo (e botão para criar/tentar de novo). */
export function ServicosTareffa({ itens, previstos, acao }: { itens: ResultadoServico[]; previstos: number; acao: () => Promise<void> }) {
  if (!previstos && !itens.length) return null;
  const pendentes = previstos - itens.filter((i) => i.ok).length;
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Serviços no Tareffa</h2>
          <p className="text-xs text-gray-500">Atividades deste tipo de processo com serviço vinculado geram o serviço programado no Tareffa para a empresa.</p>
        </div>
        {pendentes > 0 && (
          <form action={acao}>
            <button type="submit" className="bg-brand-700 hover:bg-brand-900 text-white text-sm rounded px-3 py-1.5">
              {itens.length ? "Tentar de novo" : "Criar no Tareffa"}
            </button>
          </form>
        )}
      </div>
      {itens.length === 0 ? (
        <p className="text-sm text-gray-500">{previstos} serviço(s) ainda não criado(s).</p>
      ) : (
        <ul className="divide-y text-sm">
          {itens.map((i, k) => (
            <li key={k} className="py-1.5 flex items-start justify-between gap-3">
              <span><b>{i.servico}</b> <span className="text-gray-500">· {i.atividade}</span></span>
              <span className={i.ok ? "text-emerald-700" : "text-red-600"}>{i.ok ? "✓ " : "✗ "}{i.msg}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
