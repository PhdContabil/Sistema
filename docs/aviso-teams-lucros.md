# Aviso no Teams dos Lucros Distribuídos

Substitui o fluxo do Access (log no SharePoint + Power Automate). A cada lançamento, alteração ou exclusão feita no Núcleo, o servidor posta um cartão no grupo do Teams (contábil e fiscal), com o mesmo layout do Access.

## Como ativar (uma vez)

1. No Teams, abra o grupo/canal que recebe os avisos > `...` > **Fluxos de trabalho** (Workflows).
2. Crie o fluxo **Postar em um canal ou chat quando uma solicitação de webhook for recebida**. Escolha o grupo/canal de destino.
3. Ao concluir, o Teams mostra a **URL do webhook**. Ela é um segredo: não cole em chat, e-mail nem no GitHub.
4. No Vercel (projeto system-contabilidade) > Settings > Environment Variables, crie `TEAMS_WEBHOOK_LUCROS` com essa URL, no ambiente **Production**, e faça um novo deploy.

Sem a variável, o aviso fica desligado e o lançamento funciona normalmente.

## Comportamento

- Eventos: lançamento novo, alterado e excluído. Reenvio idempotente (já gravado) e simulação de ajuste não avisam.
- Se o Teams falhar, o lançamento no Questor não é afetado; a tela mostra "o aviso no Teams não foi enviado". O log do servidor registra só o status HTTP, nunca a URL.
- Valores saem em formato brasileiro (42.312,89).
