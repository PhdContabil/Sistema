import Link from "next/link";
import Workspace from "@/components/Workspace";
import AppIcon from "@/components/AppIcon";
import { getModule } from "@/lib/modules";
import {
  BotaoAtivarData, BotaoRemoverFormatura, BotaoSincronizarQuestor, ChecksLembrancinha, FormNovaData, FormNovaFormatura, LembreteControle, SeletorMes,
} from "@/components/pessoas/DatasMarcosAcoes";
import {
  carregarDatasComemorativas, carregarFormaturas, carregarPessoasAtivas, carregarLembrancinhas, carregarLembretes, carregarPessoasDatas, quemEstaAqui,
} from "@/lib/pessoas/datas-marcos-dados";
import {
  aniversariantesDoMes, dataDaRegra, emExperiencia, hojeSP, MESES, partes, rotuloAnos,
  somaDias, tempoDeCasaDoMes, type DataComemorativa,
} from "@/lib/pessoas/datas-marcos";
import { dataBR } from "@/lib/pessoas/datas-marcos-lembretes";
import { CORES_TIPO } from "@/lib/pessoas/agenda-tipos";

export const dynamic = "force-dynamic";

type Aba = "aniv" | "exp" | "datas" | "lemb";
const ABAS_RH: Aba[] = ["exp", "datas", "lemb"];
const p2 = (n: number) => String(n).padStart(2, "0");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Quando a data cai, em texto (a coluna "Quando" da aba Datas e campanhas). */
function quando(d: DataComemorativa): string {
  switch (d.regra) {
    case "anual": return `${p2(d.dia ?? 1)}/${p2(d.mes ?? 1)}`;
    case "segundo_domingo": return `2º domingo de ${MESES[(d.mes ?? 1) - 1]}`;
    case "pascoa": return "Calculada todo ano";
    case "mes": return `Mês de ${MESES[(d.mes ?? 1) - 1]}`;
    case "unica": return d.data_unica ? dataBR(d.data_unica) : "—";
  }
}

export default async function DatasEMarcos({
  searchParams,
}: {
  searchParams: { aba?: string; ano?: string; mes?: string };
}) {
  const cor = getModule("pessoas")!.color;
  const hoje = hojeSP();
  const { a: hojeAno, m: hojeMes } = partes(hoje);
  const quem = await quemEstaAqui();

  let aba = (["aniv", "exp", "datas", "lemb"].includes(searchParams.aba ?? "") ? searchParams.aba : "aniv") as Aba;
  if (ABAS_RH.includes(aba) && !quem.rh) aba = "aniv";

  const ano = Number(searchParams.ano) >= 1900 && Number(searchParams.ano) <= 2200 ? Number(searchParams.ano) : hojeAno;
  const mes = Number(searchParams.mes) >= 1 && Number(searchParams.mes) <= 12 ? Number(searchParams.mes) : hojeMes;

  const [pessoas, datas, formaturas, pessoasAtivas, lembretes, lembrancinhas] = await Promise.all([
    carregarPessoasDatas(),
    carregarDatasComemorativas(true),
    carregarFormaturas(),
    quem.rh && aba === "datas" ? carregarPessoasAtivas() : Promise.resolve([]),
    quem.rh && aba === "lemb" ? carregarLembretes() : Promise.resolve([]),
    quem.lembrancinha ? carregarLembrancinhas() : Promise.resolve(new Map()),
  ]);

  // Cartões do topo: o mês seguinte ao de hoje.
  const proxMes = hojeMes === 12 ? 1 : hojeMes + 1;
  const proxAno = hojeMes === 12 ? hojeAno + 1 : hojeAno;
  const aniProx = aniversariantesDoMes(proxAno, proxMes, pessoas);
  const casaProx = tempoDeCasaDoMes(proxAno, proxMes, pessoas);
  const marcosProx = casaProx.filter((x) => x.marco);
  const emExp = emExperiencia(hoje, pessoas);

  // Lembrancinhas ainda não entregues: mês atual e anterior (só para quem cuida delas).
  const antMes = hojeMes === 1 ? 12 : hojeMes - 1;
  const antAno = hojeMes === 1 ? hojeAno - 1 : hojeAno;
  const pendentes = quem.lembrancinha
    ? [...tempoDeCasaDoMes(antAno, antMes, pessoas), ...tempoDeCasaDoMes(hojeAno, hojeMes, pessoas)]
        .filter((x) => !lembrancinhas.get(`${x.pessoa_id}-${x.anos}`)?.entregue_em)
    : [];
  const info = (por: string | null | undefined, em: string | null | undefined) =>
    por && em ? `Por ${por.split("@")[0]} em ${dataBR(em.slice(0, 10))}` : "";

  // Próxima data comemorativa (um dia só) depois de hoje.
  let proxData: { titulo: string; data: string } | null = null;
  const ativas = datas.filter((d) => d.ativo && d.regra !== "mes");
  for (let i = 1; i <= 800 && !proxData; i++) {
    const dia = somaDias(hoje, i);
    const { a } = partes(dia);
    const achada = ativas.find((d) => dataDaRegra(d, a) === dia);
    if (achada) proxData = { titulo: achada.titulo, data: dia };
  }

  const aniMes = aniversariantesDoMes(ano, mes, pessoas);
  const casaMes = tempoDeCasaDoMes(ano, mes, pessoas);
  const semAdmissao = pessoas.filter((p) => p.ativo && !p.data_admissao);

  const abaLink = (a: Aba) => `/m/pessoas/datas-marcos?aba=${a}${a === "aniv" ? `&ano=${ano}&mes=${mes}` : ""}`;

  return (
    <Workspace moduleId="pessoas" appName="Datas e Marcos">
      <div className="app-head">
        <div className="app-ic" style={{ background: cor }}><AppIcon nome="Datas e Marcos" /></div>
        <div>
          <h1>Datas e Marcos</h1>
          <div className="desc">Aniversários, tempo de casa, período de experiência, datas comemorativas e campanhas do ano.</div>
        </div>
      </div>

      <div className="dm-tiles">
        <div className="dm-tile">
          <div className="dm-k mono">Aniversariantes em {MESES[proxMes - 1]}</div>
          <div className="dm-v">{aniProx.length}</div>
          <div className="dm-s">{aniProx.map((x) => x.nome).join(", ") || "—"}</div>
        </div>
        <div className="dm-tile">
          <div className="dm-k mono">Tempo de casa em {MESES[proxMes - 1]}</div>
          <div className="dm-v">{casaProx.length}</div>
          <div className="dm-s">
            {marcosProx.length
              ? `${marcosProx.length} ${marcosProx.length === 1 ? "marco" : "marcos"}: ${marcosProx.map((x) => `${x.nome}, ${rotuloAnos(x.anos)}`).join("; ")}`
              : "nenhum marco"}
          </div>
        </div>
        {quem.lembrancinha && (
          <div className="dm-tile">
            <div className="dm-k mono">Lembrancinhas pendentes</div>
            <div className="dm-v">{pendentes.length}</div>
            <div className="dm-s">{pendentes.length ? pendentes.map((x) => x.nome).join(", ") : "tudo entregue"}</div>
          </div>
        )}
        {quem.rh && (
          <div className="dm-tile">
            <div className="dm-k mono">Em experiência hoje</div>
            <div className="dm-v">{emExp.length}</div>
            <div className="dm-s">{emExp.length ? emExp.map((p) => p.nome).join(", ") : "ninguém dentro dos 90 dias"}</div>
          </div>
        )}
        <div className="dm-tile">
          <div className="dm-k mono">Próxima data comemorativa</div>
          <div className="dm-v">{proxData ? `${p2(partes(proxData.data).d)}/${p2(partes(proxData.data).m)}` : "—"}</div>
          <div className="dm-s">{proxData ? `${proxData.titulo} · ${partes(proxData.data).a}` : "nenhuma cadastrada"}</div>
        </div>
      </div>

      <div className="dm-abas">
        <Link href={abaLink("aniv")} className={`dm-aba${aba === "aniv" ? " on" : ""}`}>Aniversários e tempo de casa</Link>
        {quem.rh && (
          <>
            <Link href={abaLink("exp")} className={`dm-aba${aba === "exp" ? " on" : ""}`}>Experiência <span className="dm-rh">RH</span></Link>
            <Link href={abaLink("datas")} className={`dm-aba${aba === "datas" ? " on" : ""}`}>Datas e campanhas <span className="dm-rh">RH</span></Link>
            <Link href={abaLink("lemb")} className={`dm-aba${aba === "lemb" ? " on" : ""}`}>Lembretes <span className="dm-rh">RH</span></Link>
          </>
        )}
      </div>

      {aba === "aniv" && (
        <>
          <SeletorMes ano={ano} mes={mes} aba="aniv" hojeAno={hojeAno} hojeMes={hojeMes} />
          <div className="dm-duas">
            <div className="dm-card">
              <h3>🎂 Aniversariantes <span>{aniMes.length} no mês</span></h3>
              {aniMes.length === 0 ? <p className="dm-vazio">Nenhum aniversariante neste mês.</p> : (
                <table className="dm-tab"><thead><tr><th>Dia</th><th>Colaborador</th></tr></thead>
                  <tbody>{aniMes.map((x) => <tr key={`${x.dia}-${x.nome}`}><td>{p2(x.dia)}/{p2(mes)}</td><td>{x.nome}</td></tr>)}</tbody></table>
              )}
            </div>
            <div className="dm-card">
              <h3>🏢 Tempo de casa <span>{casaMes.length} no mês</span></h3>
              {casaMes.length === 0 ? <p className="dm-vazio">Ninguém faz aniversário de empresa neste mês.</p> : (
                <table className="dm-tab"><thead><tr><th>Dia</th><th>Colaborador</th><th>Tempo</th>{quem.lembrancinha && <th>Lembrancinha</th>}</tr></thead>
                  <tbody>{casaMes.map((x) => (
                    <tr key={`${x.dia}-${x.nome}`} className={x.marco ? "marco" : ""}>
                      <td>{p2(x.dia)}/{p2(mes)}</td><td>{x.nome}</td>
                      <td>{rotuloAnos(x.anos)}{x.marco && <span className="dm-selo">⭐ marco</span>}</td>
                      {quem.lembrancinha && (() => {
                        const l = lembrancinhas.get(`${x.pessoa_id}-${x.anos}`);
                        return (
                          <td>
                            <ChecksLembrancinha
                              pessoaId={x.pessoa_id} anos={x.anos}
                              feita={Boolean(l?.feita_em)} entregue={Boolean(l?.entregue_em)}
                              feitaInfo={info(l?.feita_por, l?.feita_em)} entregueInfo={info(l?.entregue_por, l?.entregue_em)}
                            />
                          </td>
                        );
                      })()}
                    </tr>
                  ))}</tbody></table>
              )}
            </div>
          </div>
          <p className="footnote">
            Aniversariantes saem da data de nascimento do cadastro; tempo de casa, da data de admissão. A idade não é exibida. Tudo isso também aparece na <Link href="/m/pessoas/agenda">Agenda mensal</Link>.
          </p>
        </>
      )}

      {aba === "exp" && quem.rh && (
        <>
          <div className="dm-card">
            <h3>Período de experiência <span>admissão no Questor · fim = admissão + 90 dias</span></h3>
            {emExp.length === 0 ? <p className="dm-vazio">Ninguém está dentro dos 90 dias de casa hoje.</p> : (
              <table className="dm-tab">
                <thead><tr><th>Colaborador</th><th>Admissão</th><th>Fim da experiência</th><th>Progresso</th><th>Situação</th></tr></thead>
                <tbody>
                  {emExp.map((p) => {
                    const restam = Math.round((Date.parse(`${p.fim_experiencia}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000);
                    const feitos = 90 - restam;
                    const corBarra = restam <= 7 ? "#dc2626" : restam <= 30 ? "#f59e0b" : "#16a34a";
                    return (
                      <tr key={p.pessoa_id}>
                        <td>{p.nome}</td>
                        <td>{p.data_admissao ? dataBR(p.data_admissao) : "—"}</td>
                        <td><strong>{p.fim_experiencia ? dataBR(p.fim_experiencia) : "—"}</strong></td>
                        <td><div className="dm-barra"><div style={{ width: `${Math.min(100, Math.max(0, (feitos / 90) * 100))}%`, background: corBarra }} /></div></td>
                        <td><span className="dm-pilula" style={{ background: corBarra }}>{restam === 0 ? "Termina hoje" : restam === 1 ? "Termina amanhã" : `Faltam ${restam} dias`}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ marginTop: 16 }}>
            <BotaoSincronizarQuestor />
            {semAdmissao.length > 0 && (
              <p className="footnote">
                Sem data de admissão no cadastro ({semAdmissao.length}): {semAdmissao.map((p) => p.nome).join(", ")}.
                A admissão vem do Questor quando a pessoa tem o código do funcionário vinculado ao cadastro.
              </p>
            )}
          </div>
        </>
      )}

      {aba === "datas" && quem.rh && (
        <>
          <div className="toolbar"><FormNovaData /><span className="contador">Datas desativadas saem da agenda, mas continuam cadastradas.</span></div>
          <div className="dm-card">
            <h3>Datas comemorativas e campanhas</h3>
            <table className="dm-tab">
              <thead><tr><th>Quando</th><th>Título</th><th>Tipo na agenda</th><th /></tr></thead>
              <tbody>
                {datas.map((d) => (
                  <tr key={d.id} className={d.ativo ? "" : "inativa"}>
                    <td><strong>{quando(d)}</strong></td>
                    <td>
                      {d.regra === "mes" && d.cor && <span className="dm-ponto" style={{ background: d.cor }} />}
                      {d.titulo}
                    </td>
                    <td>{CORES_TIPO[d.tipo]?.rotulo ?? d.tipo}</td>
                    <td className="dm-fim"><BotaoAtivarData id={d.id} ativo={d.ativo} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dm-card" style={{ marginTop: 16 }}>
            <h3>Términos de graduação e mestrado <span>{formaturas.length}</span></h3>
            <div className="toolbar" style={{ padding: "0 16px 12px" }}><FormNovaFormatura pessoas={pessoasAtivas} anoAtual={hojeAno} /></div>
            {formaturas.length === 0 ? <p className="dm-vazio">Nenhuma formatura cadastrada.</p> : (
              <table className="dm-tab">
                <thead><tr><th>Colaborador</th><th>Curso</th><th>Nível</th><th>Previsão (mês/ano)</th><th /></tr></thead>
                <tbody>
                  {formaturas.map((f) => {
                    const pv = partes(f.previsao);
                    const passou = f.previsao.slice(0, 7) < hoje.slice(0, 7);
                    return (
                      <tr key={f.id ?? `${f.pessoa_id}-${f.previsao}`}>
                        <td>{f.nome}</td><td>{f.curso}</td><td>{f.nivel}</td>
                        <td><strong>{cap(MESES[pv.m - 1].slice(0, 3))}/{pv.a}</strong>{passou && <span className="dm-pilula cinza">já passou</span>}</td>
                        <td className="dm-fim">{f.id != null && <BotaoRemoverFormatura id={f.id} nome={f.nome} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p className="footnote">
            Dia das Mães e Dia dos Pais caem no 2º domingo de maio e de agosto; a Páscoa é calculada para cada ano.
            Festa Junina, Aniversário PHD e Confraternização de fim de ano ainda não têm data: cadastre aqui quando forem definidas.
          </p>
        </>
      )}

      {aba === "lemb" && quem.rh && (
        <>
          <div className="dm-card">
            {lembretes.map((l) => (
              <div key={l.chave} className="dm-lembrete">
                <div className="dm-lembrete-txt">
                  <strong>{l.titulo}</strong>
                  <span>{l.descricao}{l.chave === "experiencia" ? ` Avisos ${l.antecedencia_dias} dias antes e no dia, também ao encarregado do setor da pessoa.` : ""} Envio às 8h30.</span>
                  <span className="dm-dest">Para: {l.destinatarios.join(", ") || "—"}</span>
                </div>
                <LembreteControle chave={l.chave} ativo={l.ativo} />
              </div>
            ))}
          </div>
          <p className="footnote">
            Os lembretes saem por e-mail às 8h e nascem desligados. “Enviar prévia para mim” manda o e-mail só para o seu
            endereço, com os dados de hoje, sem registrar envio. Os destinatários e a antecedência são ajustados pelo time de T.I.
          </p>
        </>
      )}
    </Workspace>
  );
}
