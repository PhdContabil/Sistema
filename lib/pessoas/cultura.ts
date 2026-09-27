// ============================================================================
// CULTURA E ESTRATÉGIA — conteúdo da tela interativa.
//
// Diferente dos outros textos de Pessoas, este não é um texto corrido: a tela
// mostra a evolução da Missão e da Visão numa régua de anos, os valores em
// cartões que viram, e a estratégia em frentes e metas. Por isso o conteúdo é
// estruturado por pedaço — edite o texto de cada campo, e a tela acompanha.
//
// Fonte: "Missão, visão e valores" entregue pelo RH.
// ============================================================================

export interface Versao {
  ano: string;
  /** Nome da fase ("O início", "Mais foco"...). */
  fase: string;
  /** A declaração daquele ano, exatamente como foi escrita. */
  declaracao: string;
  /** O que aquela versão dizia sobre a PHD. */
  leitura: string[];
}

export interface Pilar {
  id: "missao" | "visao";
  nome: string;
  pergunta: string;
  explica: string[];
  versoes: Versao[];
}

export interface Valor {
  nome: string;
  /** A frase curta que acompanha o valor desde 2011. */
  lema: string;
  /** Autor da frase, quando é citação. */
  autor?: string;
  significado: string[];
}

export const CULTURA_ABERTURA = {
  titulo: "Nossa cultura organizacional",
  subtitulo: "A construção da Missão, da Visão e dos Valores da PHD",
  paragrafos: [
    "Toda empresa constrói sua história por meio das decisões que toma. Algumas ficam registradas em contratos, documentos, balanços e relatórios. Outras ficam na memória das pessoas, na forma como a empresa atende um cliente, conduz um problema, toma uma decisão ou trata alguém.",
    "A Missão, a Visão e os Valores da PHD nasceram justamente desse processo. Não foram palavras escolhidas apenas para compor um quadro na parede. Foram sendo construídas, revistas e aperfeiçoadas à medida que a empresa crescia, mudava sua forma de trabalhar e compreendia melhor aquilo que queria ser.",
    "Por isso, conhecer essas mudanças também é conhecer a própria história da PHD.",
  ],
};

export const PILARES: Pilar[] = [
  {
    id: "missao",
    nome: "Missão",
    pergunta: "Por que existimos?",
    explica: [
      "A Missão representa a razão de ser da empresa. Ela delimita nosso campo de atuação e responde a uma pergunta essencial: o que fazemos e para que existimos?",
      "Desde o início, os sócios compreenderam que uma Missão precisava ser mais do que uma declaração de intenções. Ela precisava ser verdadeira: não deveria conter aquilo que a empresa ainda não era.",
    ],
    versoes: [
      {
        ano: "2009",
        fase: "O início",
        declaracao: "Oferecer às pessoas físicas e jurídicas serviços que os auxiliem na gestão de suas vidas e negócios, nas áreas administrativo-financeiras, contábeis, jurídicas e de formação, por meio de nossos colaboradores e parceiros, altamente capacitados e imbuídos pelo espírito de empreender e inovar constantemente.",
        leitura: [
          "Era uma missão ampla, que refletia o projeto inicial da empresa e a diversidade de conhecimentos que estavam na origem da PHD.",
          "Precisava representar aquilo que a empresa efetivamente fazia, transmitir credibilidade e, ao mesmo tempo, diferenciar a PHD no mercado. Por isso, foi revista.",
        ],
      },
      {
        ano: "2011",
        fase: "Mais foco",
        declaracao: "Prestar assessoria contábil às pequenas e médias empresas do ramo de serviços, com qualidade e agilidade, dentro de elevados padrões éticos, por meio de nossa equipe qualificada, garantindo total segurança ao cliente.",
        leitura: [
          "A nova formulação demonstrava uma empresa mais definida em seu campo de atuação, com foco, principalmente, em pequenas e médias empresas do setor de serviços.",
        ],
      },
      {
        ano: "2017",
        fase: "Conhecimento, qualidade e inovação",
        declaracao: "Aplicar o conhecimento acadêmico e empírico na prestação de serviços contábeis, primando pela qualidade, atendimento personalizado e inovação tecnológica.",
        leitura: [
          "Com o crescimento da PHD, o aperfeiçoamento dos processos e os investimentos em tecnologia, os sócios entenderam que era novamente necessário atualizar a Missão.",
          "Essa versão incorporou o que passou a representar com mais precisão a PHD: conhecimento, qualidade, proximidade com o cliente e tecnologia. A Missão deixou de falar apenas do que a empresa fazia e passou a expressar como acreditava que esse trabalho deveria ser feito.",
        ],
      },
    ],
  },
  {
    id: "visao",
    nome: "Visão",
    pergunta: "Onde queremos chegar?",
    explica: [
      "Se a Missão responde por que existimos, a Visão responde onde queremos chegar. Ela representa uma situação desejada: o horizonte que orienta os esforços da empresa.",
      "Desde o início, os sócios entenderam que esse horizonte precisava ser ambicioso, mas também possível — uma direção coerente com os recursos, as competências e os investimentos da PHD.",
    ],
    versoes: [
      {
        ano: "2009",
        fase: "Um sonho amplo",
        declaracao: "Ser referência nacional em serviços de contabilidade, consultoria (empresarial e pessoal) e treinamentos técnicos comportamentais que auxiliem no encontro do caminho para o sucesso profissional e pessoal.",
        leitura: [
          "Uma visão que traduzia o entusiasmo e a amplitude do projeto que estava sendo construído.",
          "Com o tempo, a empresa percebeu que precisava concentrar esforços num horizonte mais próximo e compatível com sua realidade.",
        ],
      },
      {
        ano: "2011",
        fase: "Um horizonte mais definido",
        declaracao: "Ser referência pela excelência no atendimento às pequenas e médias empresas do ramo de serviços do estado de SP.",
        leitura: [
          "A PHD passou a dizer com mais clareza quem queria atender, onde queria se destacar e qual atributo queria tornar sua marca reconhecida: a excelência no atendimento.",
        ],
      },
      {
        ano: "2017",
        fase: "Qualidade e inovação",
        declaracao: "Ser reconhecida no mercado pela qualidade e inovação tecnológica aplicada aos serviços prestados.",
        leitura: [
          "Uma PHD que já havia incorporado a tecnologia como parte importante de sua forma de trabalhar.",
          "Mais do que crescer, a empresa queria ser reconhecida pela qualidade do que entregava e pela maneira como usava a tecnologia para entregar melhor.",
        ],
      },
    ],
  },
];

export const VALORES_2009 = ["Idoneidade e ética", "Agilidade", "Comprometimento", "Profissionalismo", "Respeito"];

export const VALORES_INTRO = [
  "Se a Missão representa o que fazemos e a Visão representa onde queremos chegar, os Valores representam algo ainda mais profundo: como queremos fazer as coisas enquanto caminhamos até lá.",
  "Eles orientam comportamentos e decisões, inclusive quando não existe uma regra escrita dizendo o que fazer. A partir de 2011, os sócios entenderam que não bastava nomear valores — era preciso dizer o que aquelas palavras significavam para a PHD.",
];

export const VALORES: Valor[] = [
  {
    nome: "Compromisso",
    lema: "Com aquilo que foi acordado, ainda que tacitamente.",
    significado: [
      "Compromisso não é apenas cumprir aquilo que foi escrito. É compreender aquilo que foi combinado, aquilo que o outro espera de nós e aquilo que assumimos como responsabilidade.",
      "É fazer o que precisa ser feito porque nossa palavra tem valor.",
    ],
  },
  {
    nome: "Ética",
    lema: "Você nunca está errado em fazer a coisa certa.",
    autor: "Mark Twain",
    significado: [
      "Para a PHD, ética não depende de quem está olhando. É fazer o que é correto mesmo quando seria mais fácil fazer diferente.",
      "Resultados, metas e interesses jamais devem estar acima daquilo que consideramos certo. Ética para o profissional da contabilidade não é opção: deve estar no sangue, na alma.",
    ],
  },
  {
    nome: "Humildade",
    lema: "Em ouvir o cliente; ele sempre tem razão, não importa em que proporção: 1% ou 100%.",
    significado: [
      "Humildade não significa concordar sempre. Significa estar disposto a ouvir.",
      "Significa reconhecer que podemos não ter compreendido completamente uma situação, que podemos aprender com o outro e que o cliente conhece uma parte da realidade que nós não conhecemos. Ouvir é também uma forma de respeito.",
    ],
  },
  {
    nome: "Justiça",
    lema: "A decisão correta nem sempre é a mais agradável.",
    significado: [
      "Justiça exige equilíbrio. Algumas decisões podem não ser fáceis, populares ou agradáveis. Ainda assim, precisam ser tomadas quando são as decisões corretas.",
      "Ser justo é buscar aquilo que é correto, mesmo quando o caminho mais fácil seria outro.",
    ],
  },
  {
    nome: "Respeito",
    lema: "Ao nosso trabalho, à nossa história e a nós mesmos — como seres humanos.",
    significado: [
      "Respeitar é reconhecer o valor do que construímos. É respeitar o trabalho do outro, o cliente, os colegas, a empresa e, principalmente, as pessoas.",
      "Antes de qualquer cargo, função, salário ou resultado, existe uma pessoa. E essa compreensão também faz parte da história da PHD.",
    ],
  },
];

export const CULTURA_FECHO = {
  titulo: "Uma cultura que foi sendo construída",
  paragrafos: [
    "Ao olhar para as diferentes versões da nossa Missão, Visão e Valores, é possível perceber algo importante: a PHD não abandonou sua história a cada mudança. Ela amadureceu.",
    "Em 2009, havia um grande projeto e muitas possibilidades. Em 2011, veio a necessidade de maior foco. Em 2017, a empresa já havia crescido, investido em tecnologia e aperfeiçoado seus processos. E, ao longo de todos esses anos, alguns princípios permaneceram: compromisso, ética, humildade, justiça e respeito.",
  ],
  mudancas: ["As palavras mudaram.", "As necessidades mudaram.", "A tecnologia mudou.", "O mercado mudou.", "A própria PHD mudou."],
  permanece: "Mas a necessidade de construir uma empresa baseada em relações de confiança permaneceu.",
  definicao: "Cultura é aquilo que fazemos quando precisamos decidir.",
  gestos: [
    "É a forma como tratamos um cliente quando surge um problema.",
    "É como lidamos com um erro.",
    "É como cumprimos um compromisso.",
    "É como ouvimos alguém.",
    "É como tomamos uma decisão difícil.",
    "É como tratamos as pessoas quando ninguém está olhando.",
  ],
  final: "É, enfim, a maneira como escolhemos construir a PHD todos os dias. E essa construção continua.",
  schein: "Cultura organizacional é o conjunto de pressupostos básicos que um grupo inventou, descobriu, ou desenvolveu ao aprender como lidar com problemas de adaptação externa e integração interna e que funcionaram bem o suficiente para serem considerados válidos e ensinados a novos membros como forma correta de perceber, pensar e sentir em reação a esses problemas.",
};

// ------------------------------------------------------------- estratégia

export interface Era {
  ano: string;
  frase: string;
  texto: string[];
  metas?: { valor: string; rotulo: string }[];
  frentes?: string[];
}

export const ESTRATEGIA = {
  titulo: "Planejamento Estratégico",
  subtitulo: "A direção que escolhemos",
  intro: [
    "Missão, Visão e Valores expressam quem somos, por que existimos, onde queremos chegar e aquilo em que acreditamos. O Planejamento Estratégico responde a uma pergunta complementar: o que precisamos fazer para chegar lá?",
    "Planejar é identificar o que queremos do futuro e nos preparar no presente — transformar objetivos em prioridades e fazer escolhas sobre onde concentrar esforços. Na PHD, esse planejamento sempre foi sintetizado em uma grande frase, capaz de traduzir o principal desafio de cada momento.",
  ],
  eras: [
    {
      ano: "2012",
      frase: "Consolidar para crescer",
      texto: [
        "A PHD estava em uma fase de consolidação. O planejamento buscava aumentar a lucratividade e a rentabilidade por meio de uma carteira de clientes estáveis, rentáveis e alinhados às políticas da empresa.",
        "Ao mesmo tempo, havia a preocupação com o desenvolvimento das pessoas: qualificar, identificar e reter talentos, buscando excelência operacional, segurança e satisfação dos clientes. Era o momento de construir bases sólidas para o crescimento.",
      ],
    },
    {
      ano: "2025",
      frase: "Crescer com gestão, marca e proximidade",
      texto: [
        "A PHD já tinha uma estrutura mais madura, novos processos, mais tecnologia e uma marca consolidada. Uma das principais diretrizes passou a ser tornar o marketing digital uma ferramenta central para fortalecer a marca e ampliar a carteira de clientes.",
      ],
      metas: [
        { valor: "20%", rotulo: "de crescimento bruto ao ano" },
        { valor: "35%", rotulo: "de lucratividade, no mínimo" },
      ],
      frentes: [
        "Gestão eficiente das finanças, das pessoas e dos processos.",
        "Fortalecimento da marca por meio do marketing digital.",
        "Aproximação das lideranças com os clientes, para compreender e entregar aquilo que realmente valorizam.",
      ],
    },
  ] as Era[],
  escolhas: [
    { nome: "Mercado", pergunta: "Para quais clientes queremos direcionar nossos esforços?" },
    { nome: "Produto", pergunta: "Quais produtos e serviços queremos oferecer?" },
    {
      nome: "Maneira",
      pergunta: "Como queremos fazer isso?",
      destaque: "Com profissionais capacitados, tecnologia, inovação, proximidade, qualidade e atenção aos detalhes. É nessa maneira de atuar que uma empresa constrói sua diferenciação.",
    },
  ],
  temas: [
    {
      titulo: "Por que o foco em empresas de serviços?",
      texto: [
        "Essas empresas permitiam à PHD reduzir determinadas demandas operacionais e concentrar esforço em atividades de natureza intelectual: análise, orientação, formação de preços, contabilidade gerencial e apoio à tomada de decisões.",
        "A intenção era fazer mais do que cumprir obrigações. Era agregar valor ao negócio do cliente.",
      ],
      citacao: "O grande negócio está em se aperfeiçoar nos pequenos detalhes.",
      nota: "O princípio do Kaizen — melhoria contínua — traduz essa busca por aperfeiçoamento constante.",
    },
    {
      titulo: "O risco de não ser percebido",
      texto: [
        "Toda estratégia envolve riscos. Um dos principais identificados pela PHD é simples: se o cliente não percebe a diferença, também não percebe o valor.",
        "Num mercado em que muitas empresas oferecem serviços semelhantes, a diferenciação precisa estar no que entregamos além da obrigação: conhecimento, orientação, segurança, qualidade e proximidade. Quanto menor a quantidade de serviços puramente operacionais, maior precisa ser nossa capacidade de demonstrar valor.",
      ],
    },
    {
      titulo: "Estratégia também é foco",
      texto: [
        "Não é possível fazer tudo para todos. Escolher um mercado, determinados serviços e uma maneira de trabalhar significa concentrar recursos onde podemos gerar melhores resultados. Isso exige investimento, capacidade técnica, disposição para mudar e, muitas vezes, paciência.",
        "Não existe estratégia sem risco. Mas também não existe crescimento consistente sem coragem para escolher um caminho e sustentá-lo.",
      ],
    },
  ],
  fecho: {
    texto: "As estratégias mudaram porque a PHD mudou. Esse é o sentido do planejamento: não permanecer parado, mas saber para onde queremos ir e preparar a empresa para chegar lá. No final, uma estratégia só ganha sentido quando deixa o papel e chega ao cotidiano.",
    onde: ["Nas decisões.", "Nos processos.", "No atendimento.", "Nas pessoas.", "Nos clientes."],
    final: "É assim que uma grande frase se transforma em prática. E é assim que continuamos construindo a PHD.",
  },
};
