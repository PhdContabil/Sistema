# Aviso dos Lucros Distribuídos (Teams)

Funciona como no Access: a cada lançamento, alteração ou exclusão o Núcleo grava uma linha na lista do SharePoint (`LogOperacoes_lucros_distribuidos`, site Test) e o fluxo do Power Automate que já existe posta o aviso no grupo do contábil e fiscal.

## O que a TI precisa fornecer (uma vez)

1. Um app no Entra ID (Azure) com permissão de aplicativo para gravar nessa lista. O mais restrito é `Sites.Selected` com acesso de escrita só ao site da lista; a alternativa mais simples é `Sites.ReadWrite.All`, com consentimento do administrador.
2. Tenant ID, Client ID e Client Secret do app, o ID do site e o ID da lista.
3. Confirmar o nome interno das colunas (padrão do Access: CODIGOEMPRESA, NOMEESTAB, NOMESOCIO, CODIGOSOCIO, COMPETENCIA, VALORRENDPAGO, RESPONSAVEL, DATAHORA, STATUS, IMPOSTO). Se algum for diferente, informe em `SHAREPOINT_LUCROS_CAMPOS`, por exemplo `{"valor":"ValorRendPago"}`.

## Variáveis no Vercel (Production, segredo, nunca em chat/GitHub)

`SHAREPOINT_TENANT_ID`, `SHAREPOINT_CLIENT_ID`, `SHAREPOINT_CLIENT_SECRET`, `SHAREPOINT_SITE_ID`, `SHAREPOINT_LISTA_LUCROS_ID`, `SHAREPOINT_LISTA_INFORME_ID` (lista LogOperacoes, do informe, aluguéis e ganho de capital), opcional `SHAREPOINT_LUCROS_CAMPOS`. Depois, novo deploy.

## Comportamento

- STATUS gravado: `1º LANÇAMENTO`, `LANÇAMENTO ALTERADO` ou `LANÇAMENTO EXCLUIDO`, igual ao Access.
- Sem as variáveis, nada é gravado e o lançamento segue normal. Falha do SharePoint não afeta o Questor; a tela avisa que o aviso não foi enviado.
- Reenvio já gravado e simulação de ajuste não gravam linha.
- Alternativa direta (sem SharePoint): definir `TEAMS_WEBHOOK_LUCROS` com um webhook de Fluxos de trabalho do Teams. Use um ou outro, não os dois, para não duplicar a mensagem.

## Informe de rendimentos, aluguéis e ganho de capital

Os três tipos gravam na lista `LogOperacoes` (a mesma, sem coluna de tipo, como no Access): CODIGOEMPRESA, RENDIMENTO, RETENCAO, DATALCTOFIS (primeiro dia da competência), DATAHORA, NOMEESTAB, RESPONSAVEL, DEMAIS_RECEITAS e DIVIDENDOS. O fluxo "Rendimentos - Cont / Fis" posta "Novo Rendimento Lançado" no grupo do Teams. Ative com a variável `SHAREPOINT_LISTA_INFORME_ID` (ID da lista, o mesmo do gatilho do fluxo). Alterar e excluir do informe ainda não existem no Núcleo, então só o lançamento novo avisa.
