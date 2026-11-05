// Robô de preparação de NFS-e no Emissor Nacional (nfse.gov.br) — equivale ao botão "Salvar" do form
// emitirnota do Access (Selenium), agora com Playwright.
//
// SEGURANÇA / FLUXO (igual ao Access: o humano confere e emite):
//   1. abre o Chrome (visível), faz login (Emissor Nacional ou gov.br; sem credencial → login manual);
//   2. preenche tomador (salão), serviço, descrição e valor;
//   3. PARA ANTES de emitir. Quem clica em "Emitir" é a pessoa, na janela do Chrome.
//   O robô nunca clica no botão final de emissão.
//
// Requer: npm install   (playwright-core)   e Google Chrome instalado.

const fs = require('fs');
const path = require('path');

const BASE = (process.env.NFSE_BASE || 'https://www.nfse.gov.br/EmissorNacional').replace(/\/$/, '');
const PROFILE_DIR = path.join(__dirname, '.chrome-profile');
const SHOT_DIR = path.join(__dirname, 'data', 'prints');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const onlyDigits = (s) => String(s || '').replace(/\D/g, '');
const brDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const brMoney = (v) => Number(v).toFixed(2).replace('.', ',');           // 150,00
const hoje = () => new Date().toISOString().slice(0, 10);

/** "00000601" -> {codigo:'06.01.01', busca:'06.01.01'} (mesma regra do Access: Right(4) -> 06.01 + ".01") */
function codigoServico(codigoativmunic) {
  const a = onlyDigits(codigoativmunic).slice(-4);
  if (a.length < 4) return '';
  return `${a.slice(0, 2)}.${a.slice(2)}.01`;
}

/** No erro: guarda o print (para o chamado) e junta a mensagem que o portal mostrou na tela. */
async function capturarErro(page, ctl, e) {
  try {
    const msg = await page.evaluate(() => [...document.querySelectorAll('.modal.show, .modal.in, [role="dialog"], .swal2-popup, .alert-danger, .alert-warning, .validation-summary-errors, .field-validation-error, .text-danger')]
      .filter((x) => x.offsetParent !== null).map((x) => x.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ').slice(0, 500));
    if (msg) { ctl.log('Mensagem do portal: ' + msg); e.message = `${e.message} [PORTAL: ${msg}]`; }
  } catch { /* página fechada */ }
  try {
    const campos = await page.evaluate(() => {
      const vis = (x) => x.offsetParent !== null;
      const rotulo = (el) => {
        const id = el.id && document.querySelector(`label[for="${el.id}"]`);
        const g = el.closest('.form-group, .col, [class*="col-"], fieldset, .row');
        return ((id && id.innerText) || (g && g.innerText) || el.name || el.id || '').replace(/\s+/g, ' ').trim().slice(0, 90);
      };
      const out = new Set();
      for (const el of document.querySelectorAll('input, select, textarea')) {
        if (!vis(el) || el.type === 'hidden' || el.type === 'button' || el.type === 'submit') continue;
        if (el.type === 'radio') { if (!document.querySelector(`input[type=radio][name="${el.name}"]:checked`)) out.add('(sem marcar) ' + rotulo(el)); continue; }
        if (!el.value) out.add('(vazio) ' + rotulo(el));
      }
      return [...out].slice(0, 12).join(' | ');
    });
    if (campos) { ctl.log('Campos da tela ainda sem preencher: ' + campos); e.message = `${e.message} [CAMPOS: ${campos}]`; }
  } catch { /* página fechada */ }
  try { if (ctl.setPrint) ctl.setPrint((await page.screenshot({ type: 'jpeg', quality: 60 })).toString('base64')); } catch { /* sem print */ }
}

/**
 * Marca "Não" na pergunta cujo texto bate com `pergunta` (ex.: exportação/imunidade), sem depender
 * da posição na página — o portal vem incluindo campos novos (Reforma Tributária) que mudam o layout.
 */
async function marcarNao(page, pergunta) {
  return page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const radios = [...document.querySelectorAll('input[type=radio]')];
    const nomes = [...new Set(radios.map((r) => r.name))];
    for (const nome of nomes) {
      const grupo = radios.filter((r) => r.name === nome);
      let caixa = grupo[0].parentElement;
      for (let i = 0; i < 6 && caixa && !re.test(caixa.innerText || ''); i++) caixa = caixa.parentElement;
      if (!caixa || !re.test(caixa.innerText || '')) continue;
      const nao = grupo.find((r) => {
        const lab = r.closest('label') || (r.id && document.querySelector(`label[for="${r.id}"]`)) || r.parentElement;
        return /^\s*n[aã]o\s*$/i.test((lab && lab.innerText) || '') || /^(0|false|n|nao)$/i.test(r.value);
      });
      if (!nao) continue;
      const lab = nao.closest('label') || (nao.id && document.querySelector(`label[for="${nao.id}"]`));
      if (lab) lab.click(); else nao.click();
      nao.checked = true;
      nao.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }, pergunta.source);
}

/** Depois de enviar o login: se o portal recusar (senha/usuário), avisa na hora em vez de esperar 5 minutos. */
async function conferirLogin(page) {
  await sleep(3500);
  const txt = await page.evaluate(() => [...document.querySelectorAll('.alert, .alert-danger, .validation-summary-errors, .field-validation-error, .text-danger, #login-error, .br-message.danger')]
    .filter((x) => x.offsetParent !== null).map((x) => x.innerText.replace(/\s+/g, ' ').trim()).join(' | ')).catch(() => '');
  if (/senha|inv[aá]lid|incorret|bloquead|n[aã]o encontrad/i.test(txt)) throw new Error('LOGIN_RECUSADO: ' + txt.slice(0, 200));
}

/** Tenta cada seletor até um funcionar. */
async function acao(page, seletores, fn, { timeout = 15000, nome = 'elemento' } = {}) {
  let ultimo;
  for (const s of [].concat(seletores)) {
    try {
      const loc = page.locator(s).first();
      await loc.waitFor({ state: 'visible', timeout });
      return await fn(loc);
    } catch (e) { ultimo = e; }
  }
  throw new Error(`Não encontrei ${nome} no portal (${[].concat(seletores)[0]}). ${ultimo ? ultimo.message.split('\n')[0] : ''}`);
}

/** Clica várias vezes ao longo de alguns segundos (o portal recria a seção via AJAX). */
async function cliqueRobusto(page, seletores, nome, tentativas = 8) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    for (const s of [].concat(seletores)) {
      try { await page.locator(s).first().click({ timeout: 2500, force: true }); return; } catch (e) { ultimo = e; }
    }
    await sleep(800);
  }
  throw new Error(`Não encontrei ${nome} no portal. ${ultimo ? ultimo.message.split('\n')[0] : ''}`);
}

/** Abre a página tentando de novo quando o portal cai (ERR_CONNECTION_RESET) ou demora. */
async function irPara(page, url) {
  let ultimo;
  for (let i = 0; i < 4; i++) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); return; }
    catch (e) { ultimo = e; await sleep(4000 + i * 3000); }
  }
  throw new Error('PORTAL_INSTAVEL: o Emissor Nacional não abriu (' + String(ultimo && ultimo.message || '').split('\n')[0] + ')');
}

/** Item da NBS (campo novo da Reforma Tributária): escolhe a opção que o portal sugere para o código do serviço. */
async function escolherNBS(page, log) {
  const abrir = page.locator('xpath=//label[contains(normalize-space(.),"NBS")]/following::span[contains(@class,"select2-selection")][1]').first();
  if (!(await abrir.isVisible().catch(() => false))) return;
  const atual = (await abrir.innerText().catch(() => '')).trim();
  if (atual && !/selecione/i.test(atual)) { log('Item da NBS já preenchido pelo portal: ' + atual); return; }
  await abrir.click();
  const op = page.locator('.select2-container--open .select2-results__option:not(.select2-results__message):not(.loading-results)').filter({ hasNotText: /selecione/i }).first();
  await op.waitFor({ state: 'visible', timeout: 25000 });
  const txt = (await op.innerText()).trim();
  await op.click();
  log('Item da NBS: ' + txt + ' (confira).');
}

async function select2(page, abrir, busca, escolherTexto, nome = 'lista de seleção') {
  await acao(page, abrir, (l) => l.click(), { nome, timeout: 15000 });
  const campo = page.locator('.select2-container--open .select2-search__field').or(page.locator('xpath=/html/body/span/span/span[1]/input')).first();
  await campo.waitFor({ state: 'visible', timeout: 8000 });
  await campo.fill('');
  await campo.type(busca, { delay: 40 });
  await sleep(2500);
  const item = page.locator(`.select2-results__option:has-text("${escolherTexto.replace(/"/g, '')}")`).first();
  try {
    await item.waitFor({ state: 'visible', timeout: 25000 });
  } catch {
    // O portal às vezes não devolve a lista na primeira busca: limpa e digita de novo.
    await campo.fill(''); await sleep(1000); await campo.type(busca, { delay: 60 });
    await item.waitFor({ state: 'visible', timeout: 25000 });
  }
  await item.click();
}

/**
 * @param job  {cod, data(YYYY-MM-DD), valor, tomadorCnpj, descricao, municipio, uf, codigoativmunic, servicoBusca}
 * @param creds { emissor?:{usr,senha}, govbr?:{cpf,senha} } | null
 * @param ctl  { log(msg), setStatus(s), cancelado():bool, onPage(ctx) }
 */
/**
 * Chrome aberto pelo robô (Playwright) salva downloads com nome aleatório e SEM extensão
 * (ex.: "f641f219-eb0a-…"), em pasta temporária. Aqui cada download é salvo na pasta
 * Downloads do Windows com o nome que o site sugere (ex.: "NFSe_….pdf").
 */
function salvarDownloads(ctx, log) {
  const pasta = path.join(require('os').homedir(), 'Downloads');
  const ligar = (pg) => pg.on('download', async (d) => {
    try {
      let nome = d.suggestedFilename() || `arquivo-${Date.now()}`;
      if (!/\.[a-z0-9]{2,5}$/i.test(nome)) nome += '.pdf';
      let destino = path.join(pasta, nome);
      for (let i = 1; fs.existsSync(destino); i++) destino = path.join(pasta, nome.replace(/(\.[^.]+)$/, ` (${i})$1`));
      await d.saveAs(destino);
      if (log) log(`Arquivo salvo em Downloads: ${path.basename(destino)}`);
    } catch (e) { if (log) log(`Falha ao salvar o download: ${e.message}`); }
  });
  ctx.pages().forEach(ligar);
  ctx.on('page', ligar);
}

async function preparar(job, creds, ctl) {
  const { chromium } = require('playwright-core');
  fs.mkdirSync(PROFILE_DIR, { recursive: true }); fs.mkdirSync(SHOT_DIR, { recursive: true });
  const ctx = await chromium.launchPersistentContext(path.join(PROFILE_DIR, String(job.cod)), {
    channel: 'chrome', headless: process.env.NFSE_HEADLESS === '1', viewport: process.env.NFSE_HEADLESS === '1' ? { width: 1280, height: 900 } : null, args: ['--start-maximized'],
    acceptDownloads: true,
  });
  salvarDownloads(ctx, ctl.log);
  ctl.onPage(ctx);
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.setDefaultTimeout(30000);
  const print = async (nome) => { try { await page.screenshot({ path: path.join(SHOT_DIR, `${job.id}_${nome}.png`) }); } catch {} };

  try {
    // ---------------- login ----------------
    ctl.setStatus('login'); ctl.log('Abrindo o Emissor Nacional…');
    if (creds && creds.emissor && creds.emissor.usr) {
      await irPara(page, `${BASE}/Login?ReturnUrl=%2fEmissorNacional`);
      for (let i = 0; i < 3; i++) {
        if (await page.locator('#Inscricao').first().isVisible().catch(() => false)) break;
        await sleep(3000); await irPara(page, `${BASE}/Login?ReturnUrl=%2fEmissorNacional`);
      }
      await acao(page, '#Inscricao', (l) => l.fill(creds.emissor.usr), { nome: 'campo de inscrição', timeout: 30000 });
      await acao(page, '#Senha', (l) => l.fill(creds.emissor.senha), { nome: 'campo de senha' });
      await acao(page, ['button:has-text("Entrar")', 'xpath=//button[contains(text(),"Entrar")]'], (l) => l.click(), { nome: 'botão Entrar' });
      ctl.log('Login pelo Emissor Nacional enviado.');
      await conferirLogin(page);
    } else if (creds && creds.govbr && creds.govbr.cpf) {
      await irPara(page, `${BASE}/AcessoGovBR/AcessarGovBR`);
      await acao(page, '#accountId', (l) => l.fill(onlyDigits(creds.govbr.cpf)), { nome: 'campo CPF (gov.br)' });
      await acao(page, '#enter-account-id', (l) => l.click(), { nome: 'botão continuar (gov.br)' });
      await acao(page, '#password', (l) => l.fill(creds.govbr.senha), { nome: 'campo senha (gov.br)', timeout: 15000 });
      await acao(page, '#submit-button', (l) => l.click(), { nome: 'botão entrar (gov.br)' });
      ctl.log('Login gov.br enviado (se pedir captcha/2 fatores, conclua na janela).');
    } else {
      await irPara(page, `${BASE}/Login?ReturnUrl=%2fEmissorNacional`);
      ctl.log('Sem credencial cadastrada: faça o LOGIN MANUALMENTE na janela do Chrome (aguardando até 5 min).');
    }
    // espera estar logado (fora das telas de login / gov.br)
    await page.waitForFunction((host) => location.hostname === host && !/Login|AcessoGovBR/i.test(location.pathname),
      new URL(BASE).hostname, { timeout: 5 * 60 * 1000 });
    if (ctl.cancelado()) return;
    ctl.log('Logado.'); await print('login');

    // ---------------- preenchimento ----------------
    ctl.setStatus('preenchendo');
    const tomador = onlyDigits(job.tomadorCnpj);
    const valor = brMoney(job.valor);
    const busca = job.servicoBusca || codigoServico(job.codigoativmunic);

    if (job.data === hoje()) {
      ctl.log('Emissão do dia → DPS Simplificada.');
      await irPara(page, `${BASE}/DPS/Simplificada`);
      if (tomador) {
        await acao(page, ['xpath=/html/body/div[1]/form/div[1]/div/div[1]/div/div[1]/div/div/input', 'input[id*="Tomador" i]'], (l) => l.fill(tomador), { nome: 'campo do tomador' });
        await sleep(500);
        await acao(page, ['xpath=/html/body/div[1]/form/div[1]/div/div[1]/div/div[1]/div/div/span/button[1]'], (l) => l.click(), { nome: 'botão pesquisar tomador' });
        await sleep(2500);
      } else ctl.log('Sem tomador: campo do tomador deixado em branco.');
      await acao(page, ['xpath=/html/body/div[1]/form/div[1]/div/div[2]/div/div/div/div/a/span'], (l) => l.click(), { nome: 'lista de serviço' });
      await acao(page, ['xpath=//li[contains(text(), "padrao")]', 'li:has-text("padrao")'], (l) => l.click(), { nome: 'serviço "padrao" (cadastre-o no portal)' });
      await sleep(2500);
      await acao(page, '#ValorServico', async (l) => { await l.fill(''); await l.type(valor, { delay: 30 }); }, { nome: 'campo valor' });
    } else {
      ctl.log('Data diferente de hoje → DPS completa (competência ' + brDate(job.data) + ').');
      await irPara(page, `${BASE}/DPS/Pessoas`);
      await sleep(1000);
      // Reforma Tributária (IBS/CBS): responder "Não"
      await acao(page, ['xpath=//*[@id="pnlInfoIBSCBS"]/div[1]/div/div[2]/label'], (l) => l.click(), { nome: 'pergunta IBS/CBS', timeout: 6000 }).catch(() => ctl.log('Pergunta IBS/CBS não apareceu (ok).'));
      await acao(page, '#DataCompetencia', async (l) => { await l.fill(''); await l.type(brDate(job.data), { delay: 40 }); await l.press('Tab'); }, { nome: 'data de competência' });
      await sleep(3500);
      if (tomador) {
        await cliqueRobusto(page, ['xpath=//*[@id="pnlTomador"]/div[1]/div/div/div[1]/label/span', 'xpath=//*[@id="pnlTomador"]/div[1]/div/div/div[1]/label', '#pnlTomador label:has-text("Brasil")'], 'tipo de tomador (Brasil)');
        await sleep(1000);
        await acao(page, '#Tomador_Inscricao', (l) => l.fill(tomador), { nome: 'inscrição do tomador' });
        for (let i = 0; i < 3; i++) {
          await acao(page, '#btn_Tomador_Inscricao_pesquisar', (l) => l.click(), { nome: 'pesquisar tomador' });
          await sleep(4000);
          const falhou = await page.evaluate(() => /n[aã]o foi poss[ií]vel recuperar/i.test(document.body.innerText)).catch(() => false);
          if (!falhou) break;
          ctl.log(`Portal não trouxe os dados do tomador (tentativa ${i + 1}); tentando de novo…`);
          await page.keyboard.press('Escape').catch(() => null);
          await page.locator('.modal.show button:has-text("OK"), .modal.show button:has-text("Fechar"), .swal2-confirm').first().click({ timeout: 2000 }).catch(() => null);
          await sleep(5000);
        }
      } else {
        // Sem tomador: marcar "Tomador/Adquirente não informado" (senão o portal não deixa avançar).
        await cliqueRobusto(page, [
          '#pnlTomador label:has-text("não informado")',
          '#pnlTomador label:has-text("Não informado")',
          'xpath=//*[@id="pnlTomador"]//label[contains(translate(normalize-space(.),"NÃOINFRMD","nãoinfrmd"),"não informado")]',
          'label:has-text("Tomador/Adquirente não informado")',
        ], 'opção "Tomador/Adquirente não informado"');
        await sleep(2000);
        ctl.log('Sem tomador: marcado "Tomador/Adquirente não informado".');
      }
      await acao(page, '#btnAvancar', (l) => l.click(), { nome: 'botão Avançar' });
      // O portal às vezes demora (ou recusa) para sair da tela de Pessoas: espera a tela de Serviço.
      await page.waitForURL(/\/DPS\/Servico/i, { timeout: 20000 }).catch(() => null);
      if (/\/DPS\/Pessoas/i.test(page.url())) {
        await cliqueRobusto(page, ['#btnAvancar'], 'botão Avançar', 3).catch(() => null);
        await page.waitForURL(/\/DPS\/Servico/i, { timeout: 15000 }).catch(() => null);
        if (/\/DPS\/Pessoas/i.test(page.url())) throw new Error('O portal não saiu da tela de Pessoas (confira data de competência e tomador na janela do Chrome).');
      }
      await page.waitForLoadState('domcontentloaded').catch(() => null);
      await sleep(2500);
      // município + serviço (o portal muda o layout: tenta o caminho antigo e, se não achar, as listas da tela)
      await select2(page, ['xpath=/html/body/div[1]/form/div[1]/div/div/div[2]/div/span[1]/span[1]/span', '#pnlLocalPrestacao .select2-selection', 'form .select2-selection >> nth=0'],
        job.municipio, `${job.municipio}/${job.uf}`, 'lista do município (local da prestação)');
      await sleep(3000);
      await select2(page, ['xpath=/html/body/div[1]/form/div[2]/div/div[1]/div/div/span[1]/span[1]/span', '#pnlServicoPrestado .select2-selection', 'form .select2-selection >> nth=1'],
        busca, busca, 'lista do código do serviço');
      await sleep(3000);
      await escolherNBS(page, ctl.log).catch((e) => ctl.log('Item da NBS: não consegui escolher (' + String(e.message).split('\n')[0] + ') — escolha na janela.'));
      await sleep(2500);
      const naoAntigo = await acao(page, ['xpath=/html/body/div[1]/form/div[2]/div/div[3]/div/div[1]/label/span/i'], (l) => l.click(), { nome: 'opção "não"', timeout: 4000 }).then(() => true).catch(() => false);
      if (!naoAntigo) {
        await sleep(1000);
        const ok = await marcarNao(page, /exporta|imunidade|n[aã]o incid/);
        if (!ok) throw new Error('Não encontrei a pergunta "exportação / imunidade" para marcar "Não" (o portal mudou a tela).');
        ctl.log('Pergunta exportação/imunidade: marcado "Não".');
      }
      await acao(page, '#ServicoPrestado_Descricao', (l) => l.fill(job.descricao || ''), { nome: 'descrição do serviço' });
      await acao(page, ['xpath=//*[@id="main-content"]/form/div[8]/button', '#main-content form button:has-text("Avançar")', 'button:has-text("Avançar") >> visible=true'], (l) => l.click(), { nome: 'botão Avançar (serviço)' });
      await sleep(3000);
      await acao(page, '#Valores_ValorServico', async (l) => { await l.fill(''); await l.type(valor, { delay: 30 }); }, { nome: 'valor do serviço' });
    }
    await sleep(800); await print('preenchido');
    await page.bringToFront();
    ctl.setStatus('aguardando_confirmacao');
    ctl.log('PRONTO: confira os dados na janela do Chrome e clique em EMITIR você mesmo. Depois, volte aqui e conclua.');
  } catch (e) {
    await print('erro');
    await capturarErro(page, ctl, e);
    ctl.log('ERRO: ' + e.message);
    throw e;
  }
}

module.exports = { salvarDownloads, preparar, codigoServico, hoje, capturarErro };
