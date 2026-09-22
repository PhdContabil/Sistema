"use client";

import { useMemo, useState } from "react";
import { DIMENSOES } from "@/lib/roda-vida-conteudo";
import { corDaNota, type Notas } from "@/lib/roda-vida-calculo";
import { formatDataHora } from "@/lib/datas";

interface Linha {
  email: string;
  nome: string | null;
  concluida_em: string;
  media: number;
  notas: Notas;
  acoes: number;
  acoesFeitas: number;
}

/**
 * Visão da diretoria: a última roda fechada de cada pessoa.
 *
 * Fica recolhida por padrão. É informação sensível, e abrir sozinha numa tela
 * que alguém pode estar projetando ou mostrando a um colega exporia a vida
 * pessoal do time sem ninguém ter pedido.
 */
export default function PainelRodaDiretoria({ inicial }: { inicial: Linha[] }) {
  const [aberto, setAberto] = useState(false);

  const mediaGeral = useMemo(() => {
    if (inicial.length === 0) return 0;
    return Math.round((inicial.reduce((s, l) => s + l.media, 0) / inicial.length) * 10) / 10;
  }, [inicial]);

  const porDimensao = useMemo(() => {
    return DIMENSOES.map((d) => {
      const vs = inicial.map((l) => l.notas[d.id]).filter((v) => v !== undefined) as number[];
      const m = vs.length > 0 ? vs.reduce((s, v) => s + v, 0) / vs.length : 0;
      return { ...d, media: Math.round(m * 10) / 10, respostas: vs.length };
    }).sort((a, b) => a.media - b.media);
  }, [inicial]);

  return (
    <div className="card rv-diretoria">
      <button className="rv-dim-cab" onClick={() => setAberto((v) => !v)}>
        <span className="rv-emoji">👥</span>
        <span className="rv-dim-nome">Visão da diretoria</span>
        <span className="rv-dim-qtd">{inicial.length}</span>
        <span className="rv-seta">{aberto ? "▲" : "▼"}</span>
      </button>

      {aberto && (
        inicial.length === 0 ? (
          <p className="rv-nota-info">Ninguém fechou a roda ainda.</p>
        ) : (
          <>
            <p className="rv-nota-info">
              Última roda fechada de cada pessoa. Rascunho não aparece aqui — roda pela
              metade não é a opinião de ninguém.
            </p>

            <div className="rv-dir-topo">
              <div><span className="k">Pessoas</span><span className="v">{inicial.length}</span></div>
              <div>
                <span className="k">Média do escritório</span>
                <span className="v" style={{ color: corDaNota(mediaGeral) }}>{mediaGeral.toFixed(1)}</span>
              </div>
            </div>

            <h4>Por dimensão, da menor média para a maior</h4>
            <ul className="rv-dir-dims">
              {porDimensao.map((d) => (
                <li key={d.id}>
                  <span className="rv-emoji">{d.emoji}</span>
                  <span className="rv-dir-nome">{d.nome}</span>
                  <span className="rv-dir-barra">
                    <span style={{ width: `${(d.media / 10) * 100}%`, background: corDaNota(d.media) }} />
                  </span>
                  <strong style={{ color: corDaNota(d.media) }}>{d.media.toFixed(1)}</strong>
                </li>
              ))}
            </ul>

            <h4>Pessoa a pessoa</h4>
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th className="col-empresa">Pessoa</th>
                    <th className="num">Média</th>
                    {DIMENSOES.map((d) => (
                      <th key={d.id} className="num" title={d.nome}>{d.emoji}</th>
                    ))}
                    <th className="num">Ações</th>
                    <th>Fechada em</th>
                  </tr>
                </thead>
                <tbody>
                  {inicial.map((l) => (
                    <tr key={l.email}>
                      <td className="col-empresa">{l.nome ?? l.email}</td>
                      <td className="num" style={{ color: corDaNota(l.media), fontWeight: 600 }}>
                        {l.media.toFixed(1)}
                      </td>
                      {DIMENSOES.map((d) => (
                        <td key={d.id} className="num" style={{ color: corDaNota(l.notas[d.id] ?? 0) }}>
                          {l.notas[d.id] ?? "—"}
                        </td>
                      ))}
                      <td className="num">{l.acoesFeitas}/{l.acoes}</td>
                      <td>{formatDataHora(l.concluida_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}
    </div>
  );
}
