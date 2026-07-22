// Dados de exemplo do módulo Fiscal, usados quando a QUESTOR_API_KEY não está configurada.
import type { AnaliseLimiteResponse, DctfwebResponse, LimiteMensalItem } from "./fiscal";

function serie(base: number, ultimoMes: number, media: number): LimiteMensalItem[] {
  const out: LimiteMensalItem[] = [];
  let acc = 0;
  for (let m = 1; m <= 12; m++) {
    const projetado = m > ultimoMes;
    const fat = projetado ? null : Math.round(base * (0.8 + (m % 4) * 0.12));
    const valor = projetado ? media : (fat ?? 0);
    acc += valor;
    out.push({
      ano_mes: `2026-${String(m).padStart(2, "0")}`,
      mes: m,
      faturamento: fat,
      despesa: projetado ? null : Math.round((fat ?? 0) * 0.05),
      valor_considerado: valor,
      acumulado: Math.round(acc),
      projetado,
    });
  }
  return out;
}

export const SAMPLE_LIMITE: AnaliseLimiteResponse = {
  ano: 2026,
  data_base: "2026-07-21",
  limite_geral: 4800000,
  sublimite: 3600000,
  total: 3,
  dados: [
    {
      codigoempresa: 1119, nome: "ACME COMERCIO LTDA", cnpj: "50715659000100", ano: 2026,
      faturamento_ano: 2717766.42, meses_com_faturamento: 7, ultimo_mes_com_faturamento: 7,
      media_mensal: 388252.35, projecao_anual: 4659028.15, percentual_sublimite: 1.294,
      percentual_limite: 0.971, estoura_sublimite: true, estoura_limite: false,
      mes_estouro_sublimite: "2026-10", mes_estouro_limite: null,
      mensal: serie(388000, 7, 388252),
    },
    {
      codigoempresa: 204, nome: "BRASIL SERVICOS EIRELI", cnpj: "12345678000190", ano: 2026,
      faturamento_ano: 3500000, meses_com_faturamento: 7, ultimo_mes_com_faturamento: 7,
      media_mensal: 500000, projecao_anual: 6000000, percentual_sublimite: 1.667,
      percentual_limite: 1.25, estoura_sublimite: true, estoura_limite: true,
      mes_estouro_sublimite: "2026-08", mes_estouro_limite: "2026-10",
      mensal: serie(500000, 7, 500000),
    },
    {
      codigoempresa: 88, nome: "DELTA MEI ME", cnpj: "98765432000121", ano: 2026,
      faturamento_ano: 840000, meses_com_faturamento: 7, ultimo_mes_com_faturamento: 7,
      media_mensal: 120000, projecao_anual: 1440000, percentual_sublimite: 0.4,
      percentual_limite: 0.3, estoura_sublimite: false, estoura_limite: false,
      mes_estouro_sublimite: null, mes_estouro_limite: null,
      mensal: serie(120000, 7, 120000),
    },
  ],
};

export const SAMPLE_DCTFWEB: DctfwebResponse = {
  total: 3,
  ano: 2026,
  mes: 7,
  dados: [
    { codigoempresa: 64, cnpj: "32425127000149", nome: "AMYNA CLINICA MEDICA LTDA", ano: 2026, mes: 7, total_folha: 178.31, total_reinf: 12.65, debito_apurado: 190.96, origem: "ambos", deve_entregar: true },
    { codigoempresa: 120, cnpj: "11222333000181", nome: "BETA INDUSTRIA LTDA", ano: 2026, mes: 7, total_folha: 2540.9, total_reinf: null, debito_apurado: 2540.9, origem: "folha", deve_entregar: true },
    { codigoempresa: 305, cnpj: "44555666000172", nome: "GAMA TRANSPORTES LTDA", ano: 2026, mes: 7, total_folha: null, total_reinf: 880.0, debito_apurado: 880.0, origem: "reinf", deve_entregar: true },
  ],
};
