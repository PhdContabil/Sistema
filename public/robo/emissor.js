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

/** Tenta cada seletor até um funcionar. */
async function acao(page, seletores, fn, { timeout = 8000, nome = 'elemento' } = {}) {
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

async function select2(page, abrir, busca, escolherTexto) {
  await acao(page, abrir, (l) => l.click(), { nome: 'lista de seleção' });
  const campo = page.locator('.select2-container--open .select2-search__field').or(page.locator('xpath=/html/body/span/span/span[1]/input')).first();
  await campo.waitFor({ state: 'visible', timeout: 8000 });
  await campo.fill('');
  await campo.type(busca, { delay: 40 });
  await sleep(1500);
  const item = page.locator(`.select2-results__option:has-text("${escolherTexto.replace(/"/g, '')}")`).first();
  await item.waitFor({ state: 'visible', timeout: 10000 });
  await item.click();
}

/**
 * @param job  {cod, data(YYYY-MM-DD), valor, tomadorCnpj, descricao, municipio, uf, codigoativmunic, servicoBusca}
 * @param creds { emissor?:{usr,senha}, govbr?:{cpf,senha} } | null
 * @param ctl  { log(msg), setStatus(s), cancelado():bool, onPage(ctx) }
 */
async function preparar(job, creds, ctl) {
  const { chromium } = require('playwright-core');
  fs.mkdirSync(PROFILE_DIR, { recursive: true }); fs.mkdirSync(SHOT_DIR, { recursive: true });
  const ctx = await chromium.launchPersistentContext(path.join(PROFILE_DIR, String(job.cod)), {
    channel: 'chrome', headless: process.env.NFSE_HEADLESS === '1', viewport: process.env.NFSE_HEADLESS === '1' ? { width: 1280, height: 900 } : null, args: ['--start-maximized'],
  });
  ctl.onPage(ctx);
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.setDefaultTimeout(15000);
  const print = async (nome) => { try { await page.screenshot({ path: path.join(SHOT_DIR, `${job.id}_${nome}.png`) }); } catch {} };

  try {
    // ---------------- login ----------------
    ctl.setStatus('login'); ctl.log('Abrindo o Emissor Nacional…');
    if (creds && creds.emissor && creds.emissor.usr) {
      await page.goto(`${BASE}/Login?ReturnUrl=%2fEmissorNacional`, { waitUntil: 'domcontentloaded' });
      await acao(page, '#Inscricao', (l) => l.fill(creds.emissor.usr), { nome: 'campo de inscrição' });
      await acao(page, '#Senha', (l) => l.fill(creds.emissor.senha), { nome: 'campo de senha' });
      await acao(page, ['button:has-text("Entrar")', 'xpath=//button[contains(text(),"Entrar")]'], (l) => l.click(), { nome: 'botão Entrar' });
      ctl.log('Login pelo Emissor Nacional enviado.');
    } else if (creds && creds.govbr && creds.govbr.cpf) {
      await page.goto(`${BASE}/AcessoGovBR/AcessarGovBR`, { waitUntil: 'domcontentloaded' });
      await acao(page, '#accountId', (l) => l.fill(onlyDigits(creds.govbr.cpf)), { nome: 'campo CPF (gov.br)' });
      await acao(page, '#enter-account-id', (l) => l.click(), { nome: 'botão continuar (gov.br)' });
      await acao(page, '#password', (l) => l.fill(creds.govbr.senha), { nome: 'campo senha (gov.br)', timeout: 15000 });
      await acao(page, '#submit-button', (l) => l.click(), { nome: 'botão entrar (gov.br)' });
      ctl.log('Login gov.br enviado (se pedir captcha/2 fatores, conclua na janela).');
    } else {
      await page.goto(`${BASE}/Login?ReturnUrl=%2fEmissorNacional`, { waitUntil: 'domcontentloaded' });
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
      await page.goto(`${BASE}/DPS/Simplificada`, { waitUntil: 'domcontentloaded' });
      await acao(page, ['xpath=/html/body/div[1]/form/div[1]/div/div[1]/div/div[1]/div/div/input', 'input[id*="Tomador" i]'], (l) => l.fill(tomador), { nome: 'campo do tomador' });
      await sleep(500);
      await acao(page, ['xpath=/html/body/div[1]/form/div[1]/div/div[1]/div/div[1]/div/div/span/button[1]'], (l) => l.click(), { nome: 'botão pesquisar tomador' });
      await sleep(1500);
      await acao(page, ['xpath=/html/body/div[1]/form/div[1]/div/div[2]/div/div/div/div/a/span'], (l) => l.click(), { nome: 'lista de serviço' });
      await acao(page, ['xpath=//li[contains(text(), "padrao")]', 'li:has-text("padrao")'], (l) => l.click(), { nome: 'serviço "padrao" (cadastre-o no portal)' });
      await sleep(1500);
      await acao(page, '#ValorServico', async (l) => { await l.fill(''); await l.type(valor, { delay: 30 }); }, { nome: 'campo valor' });
    } else {
      ctl.log('Data diferente de hoje → DPS completa (competência ' + brDate(job.data) + ').');
      await page.goto(`${BASE}/DPS/Pessoas`, { waitUntil: 'domcontentloaded' });
      await sleep(1000);
      // Reforma Tributária (IBS/CBS): responder "Não"
      await acao(page, ['xpath=//*[@id="pnlInfoIBSCBS"]/div[1]/div/div[2]/label'], (l) => l.click(), { nome: 'pergunta IBS/CBS', timeout: 6000 }).catch(() => ctl.log('Pergunta IBS/CBS não apareceu (ok).'));
      await acao(page, '#DataCompetencia', async (l) => { await l.fill(''); await l.type(brDate(job.data), { delay: 40 }); await l.press('Tab'); }, { nome: 'data de competência' });
      await sleep(2500);
      await cliqueRobusto(page, ['xpath=//*[@id="pnlTomador"]/div[1]/div/div/div[1]/label/span', 'xpath=//*[@id="pnlTomador"]/div[1]/div/div/div[1]/label', '#pnlTomador label:has-text("Brasil")'], 'tipo de tomador (Brasil)');
      await sleep(1000);
      await acao(page, '#Tomador_Inscricao', (l) => l.fill(tomador), { nome: 'inscrição do tomador' });
      await acao(page, '#btn_Tomador_Inscricao_pesquisar', (l) => l.click(), { nome: 'pesquisar tomador' });
      await sleep(2000);
      await acao(page, '#btnAvancar', (l) => l.click(), { nome: 'botão Avançar' });
      await sleep(2000);
      // município + serviço
      await select2(page, 'xpath=/html/body/div[1]/form/div[1]/div/div/div[2]/div/span[1]/span[1]/span', job.municipio, `${job.municipio}/${job.uf}`);
      await sleep(2000);
      await select2(page, 'xpath=/html/body/div[1]/form/div[2]/div/div[1]/div/div/span[1]/span[1]/span', busca, busca);
      await sleep(1500);
      await acao(page, ['xpath=/html/body/div[1]/form/div[2]/div/div[3]/div/div[1]/label/span/i'], (l) => l.click(), { nome: 'opção "não" (exportação/imunidade)' });
      await acao(page, '#ServicoPrestado_Descricao', (l) => l.fill(job.descricao || ''), { nome: 'descrição do serviço' });
      await acao(page, ['xpath=//*[@id="main-content"]/form/div[8]/button'], (l) => l.click(), { nome: 'botão Avançar (serviço)' });
      await sleep(2000);
      await acao(page, '#Valores_ValorServico', async (l) => { await l.fill(''); await l.type(valor, { delay: 30 }); }, { nome: 'valor do serviço' });
    }
    await sleep(800); await print('preenchido');
    await page.bringToFront();
    ctl.setStatus('aguardando_confirmacao');
    ctl.log('PRONTO: confira os dados na janela do Chrome e clique em EMITIR você mesmo. Depois, volte aqui e conclua.');
  } catch (e) {
    await print('erro');
    ctl.log('ERRO: ' + e.message);
    throw e;
  }
}

module.exports = { preparar, codigoServico, hoje };
