// Roda da Vida — conteúdo da dinâmica.
//
// Texto transcrito do documento do RH. Está aqui, e não no banco, porque é
// conteúdo editorial: muda por decisão de quem conduz a dinâmica, não pelo uso
// do dia a dia. Trocar uma pergunta vira commit, com histórico de quem mudou.
//
// Textos das ações reescritos pelo RH em 24/09/2026, numa pegada mais de
// comando ("eu escolho…") do que de intenção ("vou tentar"). Transcritos como
// vieram, inclusive a pontuação final de cada item.
//
// Duas correções em relação ao original, ambas de numeração: a lista de
// dimensões pulava do 6 para o 6 de novo (Saúde emocional e Lazer), e a lista
// de ações já vinha numerada até 9. São 9 dimensões, e os `id` abaixo são o
// que fica gravado — mudar um id órfã as rodas antigas.

export interface Dimensao {
  id: string;
  nome: string;
  emoji: string;
  /** Uma linha dizendo o que a dimensão cobre, ao lado do nome na hora de pontuar. */
  descricao: string;
  /** Perguntas de reflexão. Não são pontuadas: servem para chegar à nota. */
  perguntas: string[];
  /** Sugestões de ação concreta para quem escolher cuidar desta dimensão. */
  acoes: string[];
  /** Frase que abre a lista de ações. */
  chamada?: string;
  /** Observação que antecede a lista, quando a dimensão pede cuidado extra. */
  aviso?: string;
}

export const DIMENSOES: Dimensao[] = [
  {
    id: "trabalho",
    nome: "Trabalho",
    emoji: "💼",
    descricao: "Motivação, sentido e orgulho do que você entrega",
    perguntas: [
      "Como está minha motivação diária para vir trabalhar?",
      "Sinto que estou evoluindo no trabalho, ainda que lentamente?",
      "Consigo encontrar sentido e realização nas atividades que faço?",
      "Estou satisfeito(a) com aquilo que tenho conseguido entregar, com minha produtividade?",
      "Tenho orgulho do meu desempenho profissional?",
    ],
    chamada: "Na próxima semana, eu escolho…",
    acoes: [
      "Conversar com meu gestor sobre algo que está me incomodando.",
      "Pedir ou oferecer um feedback.",
      "Expressar à minha liderança algo novo que gostaria de aprender.",
      "Estabelecer um limite para não levar o trabalho para outros espaços da minha vida.",
      "Listar as tarefas que venho adiando e definir por onde começar.",
      "Identificar uma atividade do trabalho que me dá sentido e dedicar mais atenção a ela.",
    ],
  },
  {
    id: "financas",
    nome: "Finanças e vida material",
    emoji: "💰",
    descricao: "Dívidas, controle de gastos, poupança e reserva",
    perguntas: [
      "Tenho dívidas que hoje me preocupam pelo valor, pelo prazo ou pelos juros?",
      "Tenho conseguido gastar menos do que ganho?",
      "Tenho conseguido poupar mensalmente, ainda que seja pouco?",
      "Tenho feito gastos por impulso ou compras que, olhando depois, percebo que não eram realmente necessárias?",
      "Tenho usado o consumo como forma de compensar cansaço, ansiedade, frustração ou estresse?",
      "Minha situação financeira tem afetado meu sono, meu humor, meus relacionamentos ou outras áreas da minha vida?",
      "Tenho algum plano ou reserva para lidar com imprevistos?",
    ],
    chamada: "Na próxima semana, eu escolho…",
    acoes: [
      "Anotar meus gastos durante a semana para entender para onde meu dinheiro está indo.",
      "Evitar sites e aplicativos de compras por alguns dias.",
      "Experimentar passar uma semana sem usar o cartão de crédito para compras não essenciais.",
      "Organizar minhas dívidas e entender minha situação financeira real.",
      "Definir um pequeno valor para guardar no próximo pagamento.",
      "Revisar assinaturas e serviços que pouco utilizo.",
      "Conversar com alguém de confiança sobre minha organização financeira.",
      "Criar uma pausa antes de comprar: parar, pensar e decidir no dia seguinte.",
    ],
  },
  {
    id: "familia",
    nome: "Família",
    emoji: "❤️",
    descricao: "Relacionamentos e presença com quem você ama",
    perguntas: [
      "Tenho demonstrado carinho, afeto, atenção e gratidão, em atitude e palavras, às pessoas que amo?",
      "Tenho conseguido estar verdadeiramente presente para minha família? O que talvez eles responderiam?",
      "Estou à disposição quando minha família precisa? Quando foi a última vez que alguém precisou muito de mim e eu consegui corresponder?",
      "Existe algo na minha relação com minha família que gostaria de melhorar?",
      "Faz quanto tempo que não compartilho um momento em família (almoço, jantar, sair)?",
      "Tenho dado às pessoas que amo a atenção que elas merecem ou apenas o tempo que sobra da minha rotina?",
    ],
    chamada: "Neste final de semana, eu escolho…",
    acoes: [
      "Fazer uma refeição em família sem celular.",
      "Ligar para alguém da família com quem não falo há algum tempo.",
      "Demonstrar carinho ou gratidão a alguém que amo.",
      "Visitar um familiar e estar verdadeiramente presente.",
      "Pedir desculpas por algo que fiz.",
      "Retomar uma conversa que estou evitando.",
      "Perguntar a alguém da família: “Como você realmente está?”",
    ],
  },
  {
    id: "amizades",
    nome: "Amizades e convivência",
    emoji: "🧑‍🤝‍🧑",
    descricao: "Amigos de verdade e espaço para ser você mesmo",
    perguntas: [
      "Tenho pessoas com quem posso conversar de verdade, de modo gratuito, sem interesse?",
      "Tenho procurado meus amigos ou espero sempre que eles me procurem?",
      "Tem alguém que perceberia se eu não estivesse bem, mesmo que eu não dissesse nada?",
      "Sinto que tenho espaço para ser eu mesmo(a) nas minhas relações?",
      "Tenho cultivado amizades ou apenas mantido contatos?",
    ],
    chamada: "Na próxima semana, eu escolho…",
    acoes: [
      "Procurar um amigo(a) que não vejo há algum tempo.",
      "Marcar um café, almoço ou encontro.",
      "Enviar uma mensagem simplesmente para saber como alguém está.",
      "Retomar uma amizade que considero importante.",
      "Participar de alguma atividade coletiva.",
      "Compartilhar com alguém de confiança algo que estou vivendo.",
    ],
  },
  {
    id: "saude",
    nome: "Saúde e cuidado comigo",
    emoji: "🏃",
    descricao: "Corpo, sono, alimentação, movimento e exames",
    perguntas: [
      "Tenho cuidado do meu corpo ou só me preocupo com ele quando algo dá errado?",
      "Tenho cuidado das necessidades básicas do meu corpo: sono, alimentação, hidratação, movimento e descanso?",
      "Tenho feito exames de rotina (check-up), pelo menos uma vez ao ano?",
      "Tenho dado atenção a exames em virtude de histórico familiar (pressão alta, diabetes, câncer)?",
    ],
    chamada: "Na próxima semana, eu escolho…",
    acoes: [
      "Deixar o celular longe da cama na hora de dormir.",
      "Usar a cadeira de massagem da PHD.",
      "Aumentar minha ingestão de água.",
      "Pesquisar e experimentar uma atividade física que combine comigo.",
      "Agendar um exame ou consulta que venho adiando.",
      "Marcar uma consulta de rotina ou check-up, quando necessário.",
      "Dar atenção a um problema de saúde que venho ignorando.",
      "Reduzir o consumo de algo que sei que não faz bem para mim.",
    ],
  },
  {
    id: "emocional",
    nome: "Saúde emocional",
    emoji: "🧠",
    descricao: "Como você lida com o que sente e com a sobrecarga",
    perguntas: [
      "Como tenho lidado com minhas preocupações, frustrações e problemas?",
      "Tenho conseguido reconhecer e expressar aquilo que estou sentindo?",
      "Tenho vivido mais no modo “resolver problemas” do que simplesmente viver?",
      "Quando estou sobrecarregado(a), consigo parar, pedir ajuda ou conversar com alguém?",
      "Tenho conseguido colocar limites ou frequentemente digo “sim” quando gostaria de dizer “não”?",
      "Tenho acumulado coisas que gostaria de falar, mas não encontro espaço ou coragem para dizer?",
    ],
    chamada: "Na próxima semana, eu escolho…",
    aviso: "Pequenas atitudes também podem fazer diferença. Escolha uma ação possível para você. Se perceber que precisa de mais apoio, considere conversar com alguém de confiança ou buscar ajuda profissional.",
    acoes: [
      "Reservar alguns minutos do dia para perceber como estou me sentindo.",
      "Conversar com alguém de confiança sobre algo que estou carregando sozinho(a).",
      "Pedir ajuda quando perceber que não estou conseguindo dar conta sozinho(a).",
      "Dizer “não” a uma situação para a qual normalmente digo “sim”, quando isso for necessário.",
      "Identificar uma situação que está me causando estresse e decidir qual será meu próximo passo.",
      "Fazer uma pausa quando perceber que estou sobrecarregado(a).",
      "Conversar com meu gestor quando uma situação do trabalho estiver afetando meu bem-estar.",
      "Escrever o que está me preocupando para organizar meus pensamentos.",
      "Buscar ajuda profissional se perceber que preciso de apoio especializado.",
    ],
  },
  {
    id: "lazer",
    nome: "Lazer e vida pessoal",
    emoji: "🎨",
    descricao: "Descanso, prazer e coisas que você faz só porque gosta",
    perguntas: [
      "Quando foi a última vez que fiz algo simplesmente porque gosto?",
      "Tenho conseguido me divertir sem sentir que estou “perdendo tempo”?",
      "Minha vida tem espaço para espontaneidade, descanso e coisas que me dão prazer?",
      "Tenho sido apenas produtivo(a) ou também tenho conseguido viver?",
    ],
    chamada: "Na próxima semana, eu escolho…",
    acoes: [
      "Fazer algo que gosto sem transformar tudo em produtividade.",
      "Retomar um hobby que abandonei.",
      "Assistir a um filme ou série que quero ver.",
      "Ouvir música com atenção, sem fazer outra coisa ao mesmo tempo.",
      "Sair para um lugar de que gosto.",
      "Fazer uma atividade ao ar livre.",
      "Experimentar algo novo simplesmente por curiosidade.",
      "Permitir-me um momento de ócio, sem culpa.",
    ],
  },
  {
    id: "espiritualidade",
    nome: "Espiritualidade e propósito",
    emoji: "🙏",
    descricao: "Sentido, fé, silêncio e direção da sua vida",
    perguntas: [
      "Tenho encontrado sentido naquilo que estou vivendo?",
      "Tenho algo que me dá esperança quando as coisas ficam difíceis? (um Ser Supremo, o Universo, alguma força superior ou algo em que acredito)",
      "Tenho reservado algum tempo para silêncio, oração, reflexão, meditação ou conexão comigo mesmo(a)?",
      "Quando enfrento dificuldades, tenho algo em que me apoiar para continuar?",
      "Minha vida hoje está caminhando na direção daquilo que considero importante?",
    ],
    chamada: "Na próxima semana, eu escolho…",
    aviso: "Cada pessoa tem suas crenças e seus valores. Escolha aquilo que fizer sentido para você.",
    acoes: [
      "Reservar alguns minutos para oração.",
      "Fazer uma meditação ou permanecer alguns minutos em silêncio.",
      "Ler algo que me inspire.",
      "Participar de uma celebração ou atividade espiritual.",
      "Refletir sobre aquilo que realmente considero importante.",
      "Retomar uma prática espiritual que abandonei.",
      "Praticar algo que esteja de acordo com meus valores.",
      "Reconhecer e agradecer por algo bom que aconteceu comigo.",
      "Dedicar algum tempo a uma causa ou pessoa que considero importante.",
    ],
  },
  {
    id: "eu",
    nome: "Eu comigo mesmo",
    emoji: "🌱",
    descricao: "A relação que você tem consigo mesmo",
    perguntas: [
      "Tenho gostado da pessoa que estou me tornando?",
      "Tenho sido muito mais exigente comigo do que seria com outra pessoa?",
      "Reconheço minhas conquistas ou estou sempre pensando no que ainda falta?",
      "Tenho me tratado com a mesma compreensão que ofereço às pessoas que amo?",
      "Se eu continuasse vivendo exatamente como vivo hoje, estaria satisfeito(a) com a pessoa que me tornaria daqui a cinco anos?",
    ],
    chamada: "Na próxima semana, eu escolho…",
    acoes: [
      "Reconhecer três coisas que fiz bem recentemente.",
      "Reduzir as comparações que faço entre minha vida e a de outras pessoas.",
      "Reservar um tempo para mim, sem obrigação de produzir.",
      "Enfrentar algo que venho adiando por medo ou insegurança.",
      "Perceber uma cobrança excessiva que faço comigo e questionar se ela é realmente necessária.",
      "Comemorar uma pequena conquista.",
      "Tratar-me com mais gentileza diante de um erro.",
      "Pedir ajuda em algo que não preciso enfrentar sozinho(a).",
    ],
  },
];

export const DIMENSAO_POR_ID: Record<string, Dimensao> =
  Object.fromEntries(DIMENSOES.map((d) => [d.id, d]));

/** Escala da nota, mostrada junto do formulário. */
export const ESCALA = {
  min: 0,
  max: 10,
  legendaMin: "está muito ruim / precisa de atenção",
  legendaMax: "estou muito satisfeito(a)",
  /** Âncoras da régua, como no rodadavida.net. */
  ancoras: { baixo: "Muito baixo", meio: "Neutro", alto: "Excelente" },
};

export const PERGUNTA_REFLEXAO = "Olhando para a minha roda, o que ela está me dizendo?";

export const FRASE_FINAL =
  "Cuidar de si não significa mudar tudo. Às vezes, significa perceber o que precisa de atenção e dar o primeiro passo.";

/** Quantas dimensões a pessoa escolhe para trabalhar. Veio do documento. */
export const DIMENSOES_PARA_ESCOLHER = 3;

// ------------------------------------------------------------------ e-mail

/** Texto do e-mail que a pessoa recebe com a roda e o plano. Do RH. */
export const EMAIL = {
  assunto: "Sua Roda da Vida: agora é hora de transformar intenção em ação",
  saudacao: "Parabéns!",
  paragrafos: [
    "Você se permitiu parar por alguns minutos, olhar para diferentes áreas da sua vida e refletir sobre como está se sentindo.",
    "Esse pequeno exercício já é uma forma de cuidado.",
    "Cuidar de você também é cuidar das pessoas que você ama e das relações que fazem parte da sua vida.",
  ],
  chamada: "Agora chegou o momento de dar o próximo passo: TRANSFORMAR INTENÇÃO EM AÇÃO",
  introCompromisso:
    "Você escolheu algumas áreas que gostaria de melhorar e identificou possíveis ações para começar. "
    + "Agora, para cada escolha, transforme a intenção em um compromisso concreto:",
  perguntas: [
    { emoji: "📅", texto: "Quando vou começar?" },
    { emoji: "📍", texto: "Onde vou fazer?" },
    { emoji: "👣", texto: "Qual será o meu primeiro passo?" },
    { emoji: "🚧", texto: "O que pode me impedir?" },
    { emoji: "🔑", texto: "O que posso fazer para superar esse obstáculo?" },
  ],
  fecho: "Não precisa resolver tudo de uma vez. Uma pequena mudança já é um começo.",
  assinatura: "Não preciso mudar tudo. Preciso apenas começar.",
};
