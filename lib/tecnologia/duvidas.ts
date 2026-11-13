// Dúvidas Frequentes de T.I. — cada item é um problema comum, com o passo a passo para resolver.
// Para incluir um novo: adicione um objeto em DUVIDAS.

export interface Passo {
  texto: string;
  /** Detalhe opcional (atalho, o que esperar, etc.). */
  detalhe?: string;
}

export interface Duvida {
  id: string;
  /** Assunto principal (título do card). */
  titulo: string;
  /** Como a pessoa reconhece o problema. */
  sintomas: string;
  /** Por que acontece — para entender o processo. */
  porque: string;
  passos: Passo[];
  link?: { rotulo: string; url: string };
  /** Quando abrir ticket. */
  quandoChamar: string;
}

export const DUVIDAS: Duvida[] = [
  {
    id: "pc-lento",
    titulo: "Computador lento",
    sintomas: "Programas demoram para abrir, o Questor ou o navegador travam, o mouse \"engasga\".",
    porque:
      "Com o uso, o Windows e os programas guardam arquivos temporários (pasta %temp%) e ocupam a memória. Limpar essa pasta e reiniciar libera espaço e memória — é o mesmo que a T.I. faz quando acessa o seu computador.",
    passos: [
      { texto: "Salve o que estiver fazendo e feche os programas que não está usando.", detalhe: "Muitas abas do navegador também pesam." },
      { texto: "Aperte as teclas Windows + R ao mesmo tempo.", detalhe: "Abre a janelinha \"Executar\"." },
      { texto: "Digite %temp% e aperte Enter.", detalhe: "Abre a pasta de arquivos temporários." },
      { texto: "Aperte Ctrl + A para selecionar tudo e depois Delete.", detalhe: "Se aparecer \"arquivo em uso\", marque \"Fazer isso para todos\" e clique em Ignorar — é normal." },
      { texto: "Esvazie a Lixeira (botão direito na Lixeira › Esvaziar Lixeira)." },
      { texto: "Reinicie o computador (Iniciar › Ligar/Desligar › Reiniciar).", detalhe: "Reiniciar, não só desligar a tela." },
    ],
    quandoChamar: "Se depois de reiniciar continuar lento, abra um ticket para a T.I. dizendo qual programa trava.",
  },
  {
    id: "internet-lenta",
    titulo: "Internet lenta",
    sintomas: "Páginas não carregam, sites do governo ficam rodando, reunião do Teams cortando.",
    porque:
      "Antes de chamar a T.I., vale medir a velocidade: assim dá para saber se o problema é a internet do escritório, o Wi-Fi do seu computador ou só um site fora do ar.",
    passos: [
      { texto: "Abra o teste de velocidade (botão abaixo).", detalhe: "Ele começa sozinho; espere o número parar de mudar." },
      { texto: "Clique em \"Mostrar mais informações\" para ver também o envio (upload) e a latência." },
      { texto: "Tire um print do resultado." },
      { texto: "Se o número estiver baixo: feche downloads e vídeos abertos e teste de novo." },
      { texto: "Se estiver no Wi-Fi, teste perto do roteador ou no cabo, se tiver." },
      { texto: "Se a velocidade estiver boa e só um site não abre, o problema é o site — tente mais tarde." },
    ],
    link: { rotulo: "Abrir teste de velocidade (fast.com)", url: "https://fast.com/pt/" },
    quandoChamar: "Se continuar lento, abra um ticket com o print do teste e o horário.",
  },
];
