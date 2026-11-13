// Dúvidas Frequentes de T.I. — cada item é um problema comum, com o passo a passo para resolver.
// Para incluir um novo: adicione um objeto em DUVIDAS.

export interface Passo {
  texto: string;
  /** Detalhe opcional (atalho, o que esperar, etc.). */
  detalhe?: string;
  /** Print do passo (arquivo em public/duvidas). */
  imagem?: string;
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
      { texto: "Aperte as teclas Windows + R ao mesmo tempo e digite %temp% na janela \"Executar\".", imagem: "/duvidas/pc-1-executar.png" },
      { texto: "Aperte Enter (ou clique em OK). Abre a pasta Temp, com os arquivos temporários.", imagem: "/duvidas/pc-2-pasta-temp.png" },
      { texto: "Aperte Ctrl + A para selecionar tudo e depois a tecla Delete.", detalhe: "Todos os itens ficam marcados em azul.", imagem: "/duvidas/pc-3-selecionar.png" },
      { texto: "Se aparecer \"Pasta em Uso\" ou \"Arquivo em Uso\", marque \"Fazer isso para todos os itens atuais\" e clique em Ignorar.", detalhe: "É normal: são arquivos que algum programa aberto ainda está usando. O resto é apagado.", imagem: "/duvidas/pc-4-em-uso.png" },
      { texto: "Abra a Lixeira (ícone na Área de Trabalho) e clique em \"Esvaziar Lixeira\".", detalhe: "Confira antes se não tem nada seu lá que queira recuperar.", imagem: "/duvidas/pc-5-lixeira.png" },
      { texto: "Reinicie o computador: Iniciar › botão Ligar/Desligar › Reiniciar.", detalhe: "Reiniciar, não só desligar a tela.", imagem: "/duvidas/pc-6-reiniciar.png" },
    ],
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
  },
];
