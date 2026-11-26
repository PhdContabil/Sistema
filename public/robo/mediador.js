// Robô do Mediador (MTE) — consulta de convenções, acordos e termos aditivos registrados.
// Abre o Chrome na tela "Instrumentos Coletivos Registrados" e PREENCHE a consulta (CNPJ ou nome do
// sindicato, tipo de instrumento, vigência, UF). Uma aba por tipo escolhido.
// O robô NÃO clica em "Pesquisar": a tela do Mediador tem reCAPTCHA, então quem pesquisa é a pessoa.

const fs = require('fs');
const path = require('path');

const URL_CONSULTA = 'https://mediador.trabalho.gov.br/sistemas/mediador/ConsultarInstColetivo';
const PROFILE_DIR = path.join(__dirname, '.chrome-profile');
const TIPOS = new Set(['', 'acordo', 'convencao', 'termoAditivoAcordo', 'termoAditivoConvecao',
  'acordoColetivoEspecificoPPE', 'acordoColetivoEspecificoDomingosFeriados', 'termoAditivoAcordoEspecificoPPE', 'termoAditivoAcordoEspecificoDomingoFeriado']);
const dig = (s) => String(s || '').replace(/\D/g, '');
const fmtCnpj = (d) => d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
const fmtData = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('/') : '';

/** Marca a caixa (se ainda não marcada) e preenche o campo ao lado. */
async function marcarEPreencher(page, chk, campo, valor) {
  const c = page.locator(chk);
  if (!(await c.isChecked().catch(() => false))) await c.click();
  const t = page.locator(campo);
  await t.click();
  await t.fill('');
  await t.pressSequentially(valor, { delay: 30 });   // campos com máscara
}

async function preencher(page, p, tipo, ctl) {
  await page.goto(URL_CONSULTA, { waitUntil: 'domcontentloaded' });
  await page.locator('#btnPesquisar').waitFor({ timeout: 30000 });
  const cnpj = dig(p.cnpj);
  if (cnpj.length === 14) await marcarEPreencher(page, '#chkNRCNPJ', '#txtNRCNPJ', fmtCnpj(cnpj));
  else if (p.nome) await marcarEPreencher(page, '#chkNORazaoSocial', '#txtNORazaoSocial', String(p.nome).slice(0, 100));
  if (tipo) await page.locator('#cboTPRequerimento').selectOption(tipo);
  if (['0', '1', '2'].includes(String(p.vigencia))) await page.locator('#cboSTVigencia').selectOption(String(p.vigencia));
  if (p.uf) await page.locator('#cboUFRegistro').selectOption({ label: String(p.uf).toUpperCase() }).catch(() => ctl.log(`UF ${p.uf} não encontrada na lista; ficou em branco.`));
  if (p.registroDe || p.registroAte) await marcarEPreencher(page, '#chkPeriodoRegistro', '#txtDTInicioRegistro', fmtData(p.registroDe)).then(() => p.registroAte && page.locator('#txtDTFimRegistro').pressSequentially(fmtData(p.registroAte), { delay: 30 }));
  await page.locator('#btnPesquisar').scrollIntoViewIfNeeded().catch(() => {});
  await page.locator('#btnPesquisar').focus().catch(() => {});
}

async function abrirMediador(job, p, ctl) {
  const { chromium } = require('playwright-core');
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const tipos = (Array.isArray(p.tipos) && p.tipos.length ? p.tipos : ['']).filter((t) => TIPOS.has(t)).slice(0, 6);
  const ctx = await chromium.launchPersistentContext(path.join(PROFILE_DIR, 'mediador'), {
    channel: 'chrome', headless: false, viewport: null, args: ['--start-maximized'], acceptDownloads: true,
  });
  ctl.onPage(ctx);
  try {
    ctl.setStatus('preenchendo');
    for (let i = 0; i < tipos.length; i++) {
      if (ctl.cancelado()) throw new Error('Cancelado.');
      const page = i === 0 ? (ctx.pages()[0] || (await ctx.newPage())) : await ctx.newPage();
      page.setDefaultTimeout(20000);
      ctl.log(`Aba ${i + 1}: ${tipos[i] || 'todos os tipos'} — preenchendo…`);
      await preencher(page, p, tipos[i], ctl);
    }
    await ctx.pages()[0].bringToFront().catch(() => {});
    ctl.setStatus('aguardando_confirmacao');
    ctl.log('PRONTO — confira cada aba e clique em "Pesquisar" no Mediador. Depois abra o instrumento para baixar.');
  } catch (e) {
    try { const pg = ctx.pages()[0]; if (pg) ctl.setPrint((await pg.screenshot({ type: 'jpeg', quality: 60 })).toString('base64')); } catch {}
    throw e;
  }
}

module.exports = { abrirMediador };
