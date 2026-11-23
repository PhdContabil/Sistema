CREATE OR REPLACE VIEW public.vw_dctfweb_obrigadas AS
 WITH reinf_retencoes AS (
         SELECT l.codigoempresa,
            EXTRACT(year FROM t.data_ret)::integer AS ano,
            EXTRACT(month FROM t.data_ret)::integer AS mes,
            sum(t.valor) AS valor
           FROM lctofisentretido l
             CROSS JOIN LATERAL ( VALUES ('INSS'::text,COALESCE(l.valorinss, 0::numeric),l.dataemissao), ('IRRF'::text,COALESCE(l.valorirrf, 0::numeric),l.datairrf), ('PIS'::text,COALESCE(l.valorpis, 0::numeric),l.datapgtopiscofinscsll), ('COFINS'::text,COALESCE(l.valorcofins, 0::numeric),l.datapgtopiscofinscsll), ('CSLL'::text,COALESCE(l.valorcsll, 0::numeric),l.datapgtopiscofinscsll)) t(imposto, valor, data_ret)
          WHERE t.valor > 0::numeric AND t.data_ret IS NOT NULL
          GROUP BY l.codigoempresa, (EXTRACT(year FROM t.data_ret)), (EXTRACT(month FROM t.data_ret))
        ), outros_rend AS (
         SELECT outrorendimentopago.codigoempresa,
            EXTRACT(year FROM outrorendimentopago.competencia)::integer AS ano,
            EXTRACT(month FROM outrorendimentopago.competencia)::integer AS mes,
            sum(COALESCE(outrorendimentopago.valorrendpago, 0::numeric)) AS valor
           FROM outrorendimentopago
          WHERE COALESCE(outrorendimentopago.valorrendpago, 0::numeric) > 0::numeric
          GROUP BY outrorendimentopago.codigoempresa, (EXTRACT(year FROM outrorendimentopago.competencia)), (EXTRACT(month FROM outrorendimentopago.competencia))
        ), folha AS (
         SELECT debitofederal.codigoempresa,
            EXTRACT(year FROM debitofederal.datalctoctr)::integer AS ano,
            EXTRACT(month FROM debitofederal.datalctoctr)::integer AS mes,
            sum(COALESCE(debitofederal.valordebito, 0::numeric)) AS valor
           FROM debitofederal
          WHERE (debitofederal.codigoimposto = ANY (ARRAY[1082, 1099, 561, 1138, 2372, 6012, 3373, 2089, 6912, 5856, 8109, 2172, 5123])) AND COALESCE(debitofederal.valordebito, 0::numeric) > 0::numeric
          GROUP BY debitofederal.codigoempresa, (EXTRACT(year FROM debitofederal.datalctoctr)), (EXTRACT(month FROM debitofederal.datalctoctr))
        ), base AS (
         SELECT u.codigoempresa,
            u.ano,
            u.mes,
            sum(u.folha) AS total_folha,
            sum(u.reinf) AS total_reinf,
            sum(u.outros) AS total_outros_rend
           FROM ( SELECT folha.codigoempresa,
                    folha.ano,
                    folha.mes,
                    folha.valor AS folha,
                    0 AS reinf,
                    0 AS outros
                   FROM folha
                UNION ALL
                 SELECT reinf_retencoes.codigoempresa,
                    reinf_retencoes.ano,
                    reinf_retencoes.mes,
                    0,
                    reinf_retencoes.valor,
                    0
                   FROM reinf_retencoes
                UNION ALL
                 SELECT outros_rend.codigoempresa,
                    outros_rend.ano,
                    outros_rend.mes,
                    0,
                    0,
                    outros_rend.valor
                   FROM outros_rend) u
          GROUP BY u.codigoempresa, u.ano, u.mes
        ), empresa_cad AS (
         SELECT estab.codigoempresa,
            estab.nomeestab AS nome,
            regexp_replace(estab.inscrfederal::text, '[^0-9]'::text, ''::text, 'g'::text)::character varying(14) AS cnpj
           FROM estab
          WHERE estab.codigoestab = 1
        )
 SELECT b.codigoempresa,
    e.cnpj,
    e.nome,
    b.ano,
    b.mes,
    b.total_folha,
    b.total_reinf,
    b.total_outros_rend,
    b.total_folha + b.total_reinf AS debito_apurado,
        CASE
            WHEN b.total_folha > 0::numeric AND (b.total_reinf > 0::numeric OR b.total_outros_rend > 0::numeric) THEN 'ambos'::text
            WHEN b.total_folha > 0::numeric THEN 'folha'::text
            ELSE 'reinf'::text
        END::character varying(10) AS origem,
    (b.total_folha + b.total_reinf + b.total_outros_rend) > 0::numeric AS deve_entregar
   FROM base b
     LEFT JOIN empresa_cad e ON e.codigoempresa = b.codigoempresa;
