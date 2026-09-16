// Especificações do servidor físico da PHD — informação praticamente
// estática (só muda se o servidor mudar de verdade), então fica aqui como
// referência direto no código em vez de uma tabela no banco. Se trocar o
// servidor ou algum componente, é só editar este arquivo.
//
// Extraído da aba "Servidor" de Controle de Notebook.xlsx em 26/09/2026.

export interface GrupoSpec {
  titulo: string;
  linhas: { label: string; valor: string }[];
}

export const SERVIDOR_SPECS: GrupoSpec[] = [
  {
    titulo: "Sistema operacional",
    linhas: [
      { label: "Sistema", valor: "Microsoft Windows Server 2019 Standard" },
      { label: "Versão", valor: "10.0.17763" },
      { label: "Arquitetura", valor: "64-bit" },
      { label: "Data de instalação", valor: "29/10/2025" },
    ],
  },
  {
    titulo: "Placa-mãe / BIOS",
    linhas: [
      { label: "Fabricante", valor: "Dell Inc." },
      { label: "Modelo", valor: "061VPC" },
      { label: "Número de série", valor: "CN747514820170" },
      { label: "Versão BIOS", valor: "2.6.0" },
      { label: "Data do BIOS", valor: "06/10/2018" },
    ],
  },
  {
    titulo: "Processador (CPU)",
    linhas: [
      { label: "Modelo", valor: "Intel(R) Xeon(R) CPU E5-2407 v2 @ 2.40GHz" },
      { label: "Quantidade de CPUs", valor: "2 (físicas)" },
      { label: "Núcleos por CPU", valor: "4" },
      { label: "Threads por CPU", valor: "4" },
      { label: "Total de núcleos", valor: "8" },
      { label: "Clock máximo", valor: "2.40 GHz" },
    ],
  },
  {
    titulo: "Memória RAM — total 31,94 GB",
    linhas: [
      { label: "Kingston (DIMM_A1)", valor: "16 GB — 1600 MHz" },
      { label: "Kingston (DIMM_B1)", valor: "16 GB — 1600 MHz" },
    ],
  },
  {
    titulo: "Armazenamento (discos)",
    linhas: [
      { label: "Kingston SEDC600M960G (USB)", valor: "894,25 GB" },
      { label: "Kingston SUV400S37240G (IDE)", valor: "223,57 GB" },
      { label: "Kingston SEDC600M960G (IDE)", valor: "894,25 GB" },
    ],
  },
  {
    titulo: "Volumes / partições",
    linhas: [
      { label: "C:", valor: "893,65 GB total — 100,57 GB livre (11%)" },
      { label: "D:", valor: "223,06 GB total — 187,33 GB livre (84%)" },
      { label: "E:", valor: "894,24 GB total — 0,01 GB livre (0%)" },
    ],
  },
  {
    titulo: "Placa de vídeo (GPU)",
    linhas: [
      { label: "Modelo", valor: "Microsoft Basic Display Adapter" },
      { label: "Versão do driver", valor: "10.0.17763.1" },
    ],
  },
  {
    titulo: "Rede",
    linhas: [
      { label: "SLOT 2 Port 2", valor: "Broadcom NetXtreme Gigabit Ethernet — 1 Gbps" },
      { label: "SLOT 2 Port 1", valor: "Broadcom NetXtreme Gigabit Ethernet #2 — 1 Gbps" },
      { label: "NIC2", valor: "Broadcom NetXtreme Gigabit Ethernet #4 — 1 Gbps" },
      { label: "NIC1", valor: "Broadcom NetXtreme Gigabit Ethernet #3 — 1 Gbps" },
    ],
  },
];
