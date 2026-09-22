// Roda da Vida — conteúdo da dinâmica.
//
// Texto transcrito do documento do RH. Está aqui, e não no banco, porque é
// conteúdo editorial: muda por decisão de quem conduz a dinâmica, não pelo uso
// do dia a dia. Trocar uma pergunta vira commit, com histórico de quem mudou.
//
// Duas correções em relação ao original, ambas de numeração: a lista de
// dimensões pulava do 6 para o 6 de novo (Saúde emocional e Lazer), e a lista
// de ações já vinha numerada até 9. São 9 dimensões, e os `id` abaixo são o
// que fica gravado — mudar um id órfã as rodas antigas.

export interface Dimensao {
  id: string;
  nome: string;
  emoji: string;
  /** Perguntas de reflexão. Não são pontuadas: servem para chegar à nota. */
  perguntas: string[];
  /** Sugestões de ação concreta para quem escolher cuidar desta dimensão. */
  acoes: string[];
  /** Frase que abre a lista de ações, quando o documento traz uma. */
  chamada?: string;
}

export const DIMENSOES: Dimensao[] = [
  {
    id: "trabalho",
    nome: "Trabalho",
    emoji: "💼",
    perguntas: [
      "Como está minha motivação diária para vir trabalhar?",
      "Sinto que estou evoluindo no trabalho, ainda que lentamente?",
      "Consigo encontrar sentido e realização nas atividades que faço?",
      "Estou satisfeito(a) com aquilo que tenho conseguido entregar, com minha produtividade?",
      "Tenho orgulho do meu desempenho profissional?",
    ],
    chamada: "Na semana que vem eu…",
    acoes: [
      "Quero e vou conversar com meu gestor sobre algo que está me incomodando",
      "Vou pedir ou oferecer um feedback",
      "Vou dizer para minha liderança que desejo aprender algo novo relacionado ao meu trabalho",
      "Não levarei trabalho para outros espaços da minha vida",
      "Vou listar todas as tarefas pendentes que estou adiando há meses e pensar numa estratégia para resolvê-las",
      "Identificarei uma atividade do trabalho que me dá sentido e dedicarei mais atenção a ela",
    ],
  },
  {
    id: "financas",
    nome: "Finanças e vida material",
    emoji: "💰",
    perguntas: [
      "Tenho dívidas que hoje me preocupam pelo valor, pelo prazo ou pelos juros?",
      "Tenho conseguido gastar menos do que ganho?",
      "Tenho conseguido poupar mensalmente, ainda que seja pouco?",
      "Tenho feito gastos por impulso ou compras que, olhando depois, percebo que não eram realmente necessárias?",
      "Tenho usado o consumo como forma de compensar cansaço, ansiedade, frustração ou estresse?",
      "Minha situação financeira tem afetado meu sono, meu humor, meus relacionamentos ou outras áreas da minha vida?",
      "Tenho algum plano ou reserva para lidar com imprevistos?",
    ],
    chamada: "Na semana que vem eu…",
    acoes: [
      "Vou anotar meus gastos para identificar onde tenho me descontrolado",
      "Não vou acessar sites de compras",
      "Vou pagar no débito / não vou usar o cartão de crédito",
      "Vou organizar minhas dívidas e entender minha real situação",
      "Vou definir um pequeno valor mensal para guardar no próximo pagamento",
      "Vou rever assinaturas e serviços que quase não utilizo",
      "Vou conversar com alguém de confiança sobre minha organização financeira",
      "Vou me desafiar: antes de comprar, parar, pensar e deixar para talvez comprar outro dia",
    ],
  },
  {
    id: "familia",
    nome: "Família",
    emoji: "❤️",
    perguntas: [
      "Tenho demonstrado carinho, afeto, atenção e gratidão, em atitude e palavras, às pessoas que amo?",
      "Tenho conseguido estar verdadeiramente presente para minha família? O que talvez eles responderiam?",
      "Estou à disposição quando minha família precisa? Quando foi a última vez que alguém precisou muito de mim e eu consegui corresponder?",
      "Existe algo na minha relação com minha família que gostaria de melhorar?",
      "Faz quanto tempo que não compartilho um momento em família (almoço, jantar, sair)?",
      "Tenho dado às pessoas que amo a atenção que elas merecem ou apenas o tempo que sobra da minha rotina?",
    ],
    chamada: "Neste fim de semana…",
    acoes: [
      "Farei uma refeição em família sem o celular",
      "Ligarei para alguém da família com quem não falo há mais de um mês",
      "Farei um ato de carinho ou gratidão a alguém que amo",
      "Visitarei algum familiar e procurarei estar realmente presente",
      "Vou pedir desculpas por algo que fiz",
      "Vou resolver uma conversa que estou evitando",
      "Vou perguntar a alguém da família: “Como você realmente está?”",
    ],
  },
  {
    id: "amizades",
    nome: "Amizades e convivência",
    emoji: "🧑‍🤝‍🧑",
    perguntas: [
      "Tenho pessoas com quem posso conversar de verdade, de modo gratuito, sem interesse?",
      "Tenho procurado meus amigos ou espero sempre que eles me procurem?",
      "Tem alguém que perceberia se eu não estivesse bem, mesmo que eu não dissesse nada?",
      "Sinto que tenho espaço para ser eu mesmo(a) nas minhas relações?",
      "Tenho cultivado amizades ou apenas mantido contatos?",
    ],
    acoes: [
      "Procurar um amigo que não vejo há algum tempo",
      "Marcar um café, almoço ou encontro",
      "Mandar uma mensagem simplesmente para saber como alguém está",
      "Retomar uma amizade que considero importante",
      "Conhecer pessoas novas",
      "Participar de alguma atividade coletiva",
      "Compartilhar com alguém algo que estou vivendo",
      "Estar mais presente quando estiver conversando com alguém",
    ],
  },
  {
    id: "saude",
    nome: "Saúde e cuidado comigo",
    emoji: "🏃",
    perguntas: [
      "Tenho cuidado do meu corpo ou só me preocupo com ele quando algo dá errado?",
      "Tenho cuidado das necessidades básicas do meu corpo: sono, alimentação, hidratação, movimento e descanso?",
      "Tenho feito exames de rotina (check-up), pelo menos uma vez ao ano?",
      "Tenho dado atenção a exames em virtude de histórico familiar (pressão alta, diabetes, câncer)?",
    ],
    acoes: [
      "Melhorar minha rotina de sono",
      "Aumentar minha ingestão de água",
      "Fazer alguma atividade física",
      "Marcar um exame ou consulta que venho adiando",
      "Fazer um check-up",
      "Dar atenção a algum problema de saúde que venho ignorando",
      "Melhorar minha alimentação em pelo menos uma refeição do dia",
      "Fazer uma pausa durante o dia para respirar, caminhar ou simplesmente descansar",
      "Respeitar mais meus limites físicos",
    ],
  },
  {
    id: "emocional",
    nome: "Saúde emocional",
    emoji: "🧠",
    perguntas: [
      "Como tenho lidado com minhas preocupações, frustrações e problemas?",
      "Tenho conseguido reconhecer e expressar aquilo que estou sentindo?",
      "Tenho vivido mais no modo “resolver problemas” do que simplesmente viver?",
      "Quando estou sobrecarregado(a), consigo parar, pedir ajuda ou conversar com alguém?",
      "Tenho conseguido colocar limites ou frequentemente digo “sim” quando gostaria de dizer “não”?",
      "Tenho acumulado coisas que gostaria de falar, mas não encontro espaço ou coragem para dizer?",
    ],
    chamada: "Ações simples e possíveis — a dinâmica não é terapia.",
    acoes: [
      "Reservar alguns minutos do dia para perceber como estou me sentindo",
      "Conversar com alguém de confiança sobre algo que estou carregando sozinho(a)",
      "Pedir ajuda quando perceber que não estou dando conta",
      "Aprender a dizer “não” para alguma situação",
      "Identificar uma situação que está me causando estresse e pensar no que posso fazer a respeito",
      "Fazer uma pausa quando perceber que estou sobrecarregado(a)",
      "Escrever aquilo que está me preocupando para organizar meus pensamentos",
      "Procurar ajuda profissional se perceber que preciso de apoio",
    ],
  },
  {
    id: "lazer",
    nome: "Lazer e vida pessoal",
    emoji: "🎨",
    perguntas: [
      "Quando foi a última vez que fiz algo simplesmente porque gosto?",
      "Tenho conseguido me divertir sem sentir que estou “perdendo tempo”?",
      "Minha vida tem espaço para espontaneidade, descanso e coisas que me dão prazer?",
      "Tenho sido apenas produtivo(a) ou também tenho conseguido viver?",
    ],
    acoes: [
      "Fazer algo que gosto sem me preocupar com produtividade",
      "Retomar um hobby que abandonei",
      "Assistir a um filme ou série que quero ver",
      "Ouvir música com atenção, sem fazer outra coisa ao mesmo tempo",
      "Sair para um lugar que gosto",
      "Fazer uma atividade ao ar livre",
      "Reservar um período da semana exclusivamente para mim",
      "Fazer alguma coisa nova simplesmente por curiosidade",
      "Ter um momento de ócio sem culpa",
    ],
  },
  {
    id: "espiritualidade",
    nome: "Espiritualidade e propósito",
    emoji: "🙏",
    perguntas: [
      "Tenho encontrado sentido naquilo que estou vivendo?",
      "Tenho algo que me dá esperança quando as coisas ficam difíceis? (um Ser Supremo, o Universo, alguma força superior ou algo em que acredito)",
      "Tenho reservado algum tempo para silêncio, oração, reflexão, meditação ou conexão comigo mesmo(a)?",
      "Quando enfrento dificuldades, tenho algo em que me apoiar para continuar?",
      "Minha vida hoje está caminhando na direção daquilo que considero importante?",
    ],
    chamada: "Cada um tem a sua crença — escolha o que fizer sentido para você.",
    acoes: [
      "Reservar alguns minutos para oração",
      "Fazer uma meditação ou momento de silêncio",
      "Ler algo que me inspire",
      "Participar de uma celebração ou atividade espiritual",
      "Fazer uma reflexão sobre aquilo que realmente considero importante",
      "Retomar uma prática espiritual que abandonei",
      "Fazer algo que esteja de acordo com meus valores",
      "Praticar uma atitude de gratidão",
      "Dedicar algum tempo a uma causa ou pessoa que considero importante",
    ],
  },
  {
    id: "eu",
    nome: "Eu comigo mesmo",
    emoji: "🌱",
    perguntas: [
      "Tenho gostado da pessoa que estou me tornando?",
      "Tenho sido muito mais exigente comigo do que seria com outra pessoa?",
      "Reconheço minhas conquistas ou estou sempre pensando no que ainda falta?",
      "Tenho me tratado com a mesma compreensão que ofereço às pessoas que amo?",
      "Se eu continuasse vivendo exatamente como vivo hoje, estaria satisfeito(a) com a pessoa que me tornaria daqui a cinco anos?",
    ],
    acoes: [
      "Reconhecer três coisas que fiz bem recentemente",
      "Parar de me comparar tanto com outras pessoas",
      "Reservar um tempo sozinho(a), sem obrigação de produzir",
      "Fazer algo que venho adiando por medo ou insegurança",
      "Perceber e questionar uma cobrança excessiva que faço comigo",
      "Comemorar uma pequena conquista",
      "Ser mais gentil comigo diante de um erro",
      "Fazer algo que represente quem eu quero ser",
      "Pedir ajuda em algo que não preciso enfrentar sozinho(a)",
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
};

export const PERGUNTA_REFLEXAO = "Olhando para a minha roda, o que ela está me dizendo?";

export const FRASE_FINAL =
  "Cuidar de si não significa mudar tudo. Às vezes, significa perceber o que precisa de atenção e dar o primeiro passo.";

/** Quantas dimensões a pessoa escolhe para trabalhar. Veio do documento. */
export const DIMENSOES_PARA_ESCOLHER = 3;
