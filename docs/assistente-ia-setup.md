# Assistente de IA do Núcleo — como montar o servidor

O assistente (bolha de chat flutuante no Núcleo) roda em cima de um modelo de
IA que fica rodando dentro da própria PHD, num computador/servidor que fica
ligado. Não é uma API paga nem uma conta de empresa de IA — é só um programa
(Ollama) rodando numa máquina nossa, e o Vercel (onde o site fica hospedado)
chama esse programa pela internet através de um túnel do Cloudflare (gratuito).

Resumindo o caminho:

```
Site (Vercel) → internet → Cloudflare Tunnel → Ollama rodando na máquina da PHD
```

Isso precisa ser feito **uma vez só**, na máquina que vai ficar ligada 24h.
Depois de pronto, funciona sozinho.

## O que essa máquina precisa ter

- Windows, Mac ou Linux — qualquer um serve.
- Pelo menos 16 GB de RAM (o modelo recomendado usa uns 5-6 GB enquanto
  responde; com menos RAM dá pra usar um modelo menor, ver nota mais abaixo).
- Ficar ligada e conectada na internet o tempo todo (é basicamente um
  servidor, mesmo que seja um PC comum).
- Não precisa de placa de vídeo (GPU) — funciona só com o processador, só que
  responde um pouco mais devagar (alguns segundos por resposta, o que é
  normal e já foi previsto no código).

## Passo 1 — Instalar o Ollama

O Ollama é o programa gratuito que roda o modelo de IA localmente. Site
oficial: https://ollama.com

1. Baixe e instale o Ollama nessa máquina (tem instalador pra Windows, Mac e
   Linux — não precisa de conta, não pede login, não pede cartão).
2. Depois de instalado, abra um terminal (PowerShell no Windows, ou
   Terminal no Mac/Linux) e baixe o modelo recomendado:

   ```
   ollama pull llama3.1:8b
   ```

   Isso baixa uns 4-5 GB — só precisa fazer isso uma vez.

   Se a máquina tiver bem menos RAM (8 GB, por exemplo), dá pra usar um
   modelo menor no lugar, tipo `llama3.2:3b` — só troca `llama3.1:8b` por
   `llama3.2:3b` em todos os comandos abaixo, incluindo na variável de
   ambiente `OLLAMA_MODEL` no Vercel (passo 4). Modelo menor responde mais
   rápido mas entende um pouco menos de contexto/nuance.

3. Teste local rápido, ainda no mesmo terminal:

   ```
   ollama run llama3.1:8b
   ```

   Se abrir um prompt de chat e você conseguir conversar, está funcionando.
   Pode sair digitando `/bye`.

## Passo 2 — Deixar o Ollama acessível na rede da máquina

Por padrão o Ollama só aceita conexões da própria máquina. Precisamos que
ele aceite conexões vindas do túnel do Cloudflare (que também vai rodar
nessa mesma máquina, então na prática ainda é "local", mas o Ollama não sabe
disso por padrão).

**Windows** — definir a variável de ambiente do sistema (uma vez só):

1. Pesquisar por "Variáveis de ambiente" no menu Iniciar → "Editar variáveis
   de ambiente do sistema" → botão "Variáveis de Ambiente...".
2. Em "Variáveis do sistema", clicar em "Novo...":
   - Nome: `OLLAMA_HOST`
   - Valor: `0.0.0.0`
3. Reiniciar o Ollama (fechar pelo ícone na bandeja do sistema e abrir de
   novo, ou reiniciar o computador).

**Mac/Linux** — antes de rodar o Ollama, exportar a variável:

```
export OLLAMA_HOST=0.0.0.0
ollama serve
```

(no Mac, se o Ollama já roda como app em segundo plano, dá pra configurar
essa mesma variável nas preferências do app, ou rodar `ollama serve` manual
num terminal que fica sempre aberto).

Pra confirmar que está ouvindo, com o Ollama rodando, abra outro terminal e
rode:

```
curl http://localhost:11434/api/tags
```

Se devolver uma lista de modelos (json), está no ar.

## Passo 3 — Cloudflare Tunnel (expor pra internet)

O Cloudflare Tunnel cria um endereço público (tipo
`https://ia.phdcontabil.com.br`) que aponta pra esse Ollama rodando local,
sem precisar abrir porta no roteador nem mexer em firewall. É gratuito e não
é uma "empresa de IA" — é só a infraestrutura de rede que leva a chamada até
a máquina.

Isso precisa de:
- Uma conta gratuita na Cloudflare (https://dash.cloudflare.com/sign-up).
- Um domínio gerenciado pela Cloudflare. Se o domínio `phdcontabil.com.br`
  já usa outro provedor de DNS/e-mail e não quiser mexer nisso, o mais simples
  é criar/usar um subdomínio só pra isso (por exemplo `ia.phdcontabil.com.br`)
  delegado pra Cloudflare via NS, sem tocar no restante do DNS existente — se
  tiver dúvida nessa parte na hora de configurar, vale confirmar com quem
  cuida do domínio antes de mudar qualquer registro DNS existente.

Passo a passo (rodar no terminal da mesma máquina do Ollama):

1. Instalar o `cloudflared`:
   - Windows: baixar o instalador em
     https://github.com/cloudflare/cloudflared/releases (arquivo
     `cloudflared-windows-amd64.msi`).
   - Mac: `brew install cloudflared`
   - Linux: seguir as instruções em
     https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

2. Fazer login (abre o navegador pra autorizar):

   ```
   cloudflared tunnel login
   ```

3. Criar o túnel (o nome pode ser qualquer coisa, ex. `nucleo-ia`):

   ```
   cloudflared tunnel create nucleo-ia
   ```

   Isso gera um arquivo de credenciais (um `.json`) e mostra o ID do túnel —
   guardar esse ID.

4. Criar um arquivo de configuração `config.yml` (num lugar fixo, tipo
   `C:\cloudflared\config.yml` no Windows ou `~/.cloudflared/config.yml` no
   Mac/Linux) com este conteúdo (trocando `<ID-DO-TUNEL>` e o caminho do
   `.json` pelo que foi gerado no passo anterior, e o hostname pelo domínio
   escolhido):

   ```yaml
   tunnel: <ID-DO-TUNEL>
   credentials-file: /caminho/para/<ID-DO-TUNEL>.json

   ingress:
     - hostname: ia.phdcontabil.com.br
       service: http://localhost:11434
     - service: http_status:404
   ```

5. Apontar o DNS do domínio pro túnel:

   ```
   cloudflared tunnel route dns nucleo-ia ia.phdcontabil.com.br
   ```

6. Rodar o túnel como serviço, pra ele voltar sozinho se a máquina reiniciar:

   ```
   cloudflared service install
   ```

   (no Windows isso instala como Serviço do Windows; no Mac/Linux instala
   como serviço do sistema — depois disso não precisa mais rodar
   `cloudflared` manualmente, ele sobe sozinho junto com a máquina.)

7. Testar de outro computador (fora da rede da PHD, tipo pelo celular com
   wifi desligado, usando dados móveis) se o endereço responde:

   ```
   curl https://ia.phdcontabil.com.br/api/tags
   ```

   Se devolver a lista de modelos, o túnel está funcionando de ponta a
   ponta.

### Opcional — proteger o endereço com Cloudflare Access

Do jeito que está acima, `https://ia.phdcontabil.com.br` fica público — quem
souber o endereço consegue chamar o Ollama diretamente (não é o fim do
mundo, já que ele só responde perguntas, não tem dado nenhum do Núcleo
guardado nele), mas é mais seguro travar o acesso só pro nosso próprio site.
Isso é opcional e pode ficar pra depois.

A forma recomendada é um "Service Token" do Cloudflare Access: ele gera um
par de chaves (Client ID + Client Secret) que o Vercel manda em todo pedido,
e só passa quem tiver essas chaves. Como isso é configurado dentro do painel
Zero Trust da Cloudflare (que muda de vez em quando), o caminho geral é:

1. No painel da Cloudflare, ir em Zero Trust → Access → Service Auth →
   Service Tokens → criar um novo token (dá um nome tipo "vercel-nucleo").
   Isso gera o `Client ID` e o `Client Secret` — copiar os dois na hora,
   porque o secret não aparece de novo depois.
2. Em Zero Trust → Access → Applications, criar uma aplicação apontando pro
   hostname `ia.phdcontabil.com.br`, com uma política que permite acesso
   quando o pedido vier com esse Service Token.
3. Guardar o Client ID e o Client Secret pra usar no passo 4 abaixo.

Se essa tela específica não bater exatamente com o que está descrito aqui
(a Cloudflare muda o painel de vez em quando), vale conferir a documentação
atual em https://developers.cloudflare.com/cloudflare-one/ na hora de
configurar.

## Passo 4 — Configurar as variáveis no Vercel

No painel do Vercel, no projeto `system-contabilidade` → Settings →
Environment Variables, adicionar (em Production, e em Preview se quiser
testar por lá também):

| Nome | Valor | Obrigatória? |
|---|---|---|
| `OLLAMA_URL` | `https://ia.phdcontabil.com.br` (o endereço do túnel, sem barra no final) | Sim |
| `OLLAMA_MODEL` | `llama3.1:8b` (ou o modelo escolhido no Passo 1) | Não — se não colocar, usa `llama3.1:8b` |
| `CF_ACCESS_CLIENT_ID` | o Client ID gerado no Passo 3 (opcional) | Só se configurou o Access |
| `CF_ACCESS_CLIENT_SECRET` | o Client Secret gerado no Passo 3 (opcional) | Só se configurou o Access |

Depois de salvar as variáveis, é preciso fazer um novo deploy pra elas
entrarem em vigor (um redeploy do último commit já resolve, não precisa
mudar código).

## Testando

Depois de tudo configurado e o deploy feito, é só abrir o Núcleo, clicar na
bolha de chat no canto da tela e mandar uma pergunta. Se aparecer
"Não consegui falar com o servidor de IA" ou "Servidor de IA respondeu
[algum número]", os pontos mais prováveis pra checar, nessa ordem:

1. O Ollama está mesmo rodando na máquina (`ollama run llama3.1:8b` funciona
   local)?
2. O túnel está no ar (`curl https://ia.phdcontabil.com.br/api/tags` de fora
   da rede da PHD devolve algo)?
3. As variáveis de ambiente no Vercel estão certas e o projeto foi
   re-deployado depois de configurá-las?
4. Se configurou o Cloudflare Access: as chaves no Vercel batem com o
   Service Token criado?

## Uma limitação a saber

Como o modelo roda numa máquina comum (sem GPU dedicada), cada resposta pode
demorar de alguns segundos até uns 30-40 segundos, dependendo do tamanho da
pergunta — bem mais devagar que um serviço de IA pago rodando em servidor
especializado. Isso já foi considerado no código (o Vercel espera até 60
segundos antes de desistir), mas se um dia isso incomodar no dia a dia, as
alternativas seriam: usar uma máquina mais forte, usar um modelo menor
(mais rápido, um pouco menos "esperto"), ou — se um dia quiser reconsiderar —
voltar a usar uma API paga de terceiros, que é mais rápida mas volta a
depender de conta/empresa externa.
