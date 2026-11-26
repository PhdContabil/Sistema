// Funções comuns do Robô do Núcleo (usadas pelo robô da guia DAS e pelo servidor do robô).
// O nome do arquivo ficou "emissor.js" por compatibilidade: robôs antigos baixam este arquivo
// ao se atualizar. A emissão de NFS-e pelo robô foi removida — agora é pela API do Portal Nacional.

const fs = require('fs');
const path = require('path');

const hoje = () => new Date().toISOString().slice(0, 10);

/** Junta a mensagem da tela, os campos vazios e um print no erro do robô (vai para o chamado da T.I.). */
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

/** Salva na pasta Downloads do usuário os arquivos baixados na janela do robô. */
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


module.exports = { salvarDownloads, hoje, capturarErro };
