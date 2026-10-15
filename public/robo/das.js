// Robô da guia DAS (PGMEI) — equivale ao botão "Emitir Guia" do form obstarefa do Access (Selenium).
// Fluxo: abre o Chrome no Simples Nacional, preenche CNPJ, CPF e código de acesso e clica em Continuar.
// Se o portal pedir verificação (captcha), QUEM RESOLVE É A PESSOA na janela do Chrome; o robô espera.
// Depois entra no PGMEI, avança para "Emitir guia" e clica na guia da competência, como o Access.
// A janela fica aberta para a pessoa conferir/baixar o PDF. O robô não paga nada.

const fs = require('fs');
const path = require('path');

const URL_SN = 'https://www8.receita.fazenda.gov.br/SimplesNacional/controleAcesso/Autentica.aspx?id=48';
const PROFILE_DIR = path.join(__dirname, '.chrome-profile');
const { capturarErro } = require('./emissor');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dig = (s) => String(s || '').replace(/\D/g, '');

async function clicar(alvo, seletores, nome, timeout = 15000) {
  const fim = Date.now() + timeout; let ultimo;
  while (Date.now() < fim) {
    for (const s of [].concat(seletores)) {
      try { await alvo.locator(s).first().click({ timeout: 2000 }); return; } catch (e) { ultimo = e; }
    }
    await sleep(500);
  }
  throw new Error(`Não encontrei ${nome}. ${ultimo ? ultimo.message.split('\n')[0] : ''}`);
}

async function guiaDAS(job, creds, ctl) {
  const { chromium } = require('playwright-core');
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const ctx = await chromium.launchPersistentContext(path.join(PROFILE_DIR, 'das-' + job.cod), {
    channel: 'chrome', headless: false, viewport: null, args: ['--start-maximized'], acceptDownloads: true,
  });
  ctl.onPage(ctx);
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.setDefaultTimeout(15000);

  try {
    ctl.setStatus('login'); ctl.log('Abrindo o Simples Nacional (PGMEI)…');
    await page.goto(URL_SN, { waitUntil: 'domcontentloaded' });
    const base = '/html/body/form/div[3]/div[2]/div[2]/div[1]/div/div[1]/ul';
    await page.locator(`xpath=${base}/li[1]/input`).fill(dig(creds.cnpj));
    await page.locator(`xpath=${base}/li[2]/input`).fill(dig(creds.cpf));
    await page.locator(`xpath=${base}/li[3]/input`).fill(String(creds.cod || '').replace(/\./g, ''));
    ctl.log('CNPJ, CPF e código de acesso preenchidos.');
    try { await page.locator('xpath=/html/body/form/div[3]/div[2]/div[2]/div[1]/div/div[2]/input').click({ timeout: 5000 }); } catch {}

    // Igual ao loop do Access: espera aparecer o frame do PGMEI. Se houver captcha, a pessoa resolve.
    ctl.setStatus('aguardando_login');
    ctl.log('Se aparecer verificação (captcha), resolva na janela do Chrome e clique em Continuar.');
    const fim = Date.now() + 5 * 60 * 1000;
    while (!(await page.locator('#frame').count())) {
      if (ctl.cancelado()) throw new Error('Cancelado.');
      if (Date.now() > fim) throw new Error('Tempo esgotado esperando o login no Simples Nacional (5 min).');
      await sleep(1000);
    }
    ctl.setStatus('preenchendo'); ctl.log('Logado. Entrando no PGMEI…');
    const fr = page.frameLocator('#frame');
    await clicar(fr, ['xpath=/html/body/div/form/div[3]/div/div/div[2]/div/div/div[2]/div/div[2]/a'], 'o link "Emitir Guia de Pagamento (DAS)"');
    await sleep(1500);
    await clicar(fr, ['xpath=/html/body/div[1]/form/div[3]/div/div[1]/div[2]/div[4]/div/input[2]'], 'o botão Continuar (ano)');
    await sleep(1500);
    await clicar(fr, ['xpath=/html/body/div[1]/form/div[3]/div/div[1]/div[2]/div[2]/div/fieldset/div/table/tbody/tr[2]/td[3]/a[1]'], 'a guia da competência');
    ctl.log('Guia aberta. Confira e baixe o PDF na janela do Chrome.');
    ctl.setStatus('aguardando_confirmacao');
  } catch (e) {
    await capturarErro(page, ctl, e);
    ctl.log('ERRO: ' + e.message);
    throw e;
  }
}

module.exports = { guiaDAS };
