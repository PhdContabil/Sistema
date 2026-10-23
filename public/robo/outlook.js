// Abre o Outlook INSTALADO no PC com uma mensagem pronta (destinatários, assunto, texto e anexos),
// sem enviar: a pessoa confere, edita e clica em Enviar. Usa a automação (COM) do Outlook clássico
// via PowerShell. Os dados vão por um arquivo JSON temporário (nada de texto do e-mail na linha de comando).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PS = `
$ErrorActionPreference = 'Stop'
$d = Get-Content -LiteralPath $args[0] -Raw -Encoding UTF8 | ConvertFrom-Json
$ol = New-Object -ComObject Outlook.Application
$m = $ol.CreateItem(0)
$m.To = ($d.para -join '; ')
$m.Subject = $d.assunto
foreach ($a in $d.anexos) { [void]$m.Attachments.Add($a) }
$m.Display()
# Depois do Display a assinatura padrão já está no corpo: coloca o texto antes dela.
$m.HTMLBody = $d.corpoHtml + $m.HTMLBody
`;

function abrirEmailOutlook({ para, assunto, corpoHtml, anexos }) {
  return new Promise((resolve, reject) => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-email-'));
    const arquivos = (anexos || []).map((a) => {
      const nome = String(a.nome || 'anexo.pdf').replace(/[\\/:*?"<>|]/g, ' ');
      const p = path.join(pasta, nome);
      fs.writeFileSync(p, Buffer.from(String(a.conteudoBase64 || ''), 'base64'));
      return p;
    });
    const dados = path.join(pasta, 'email.json');
    fs.writeFileSync(dados, JSON.stringify({ para: para || [], assunto: assunto || '', corpoHtml: corpoHtml || '', anexos: arquivos }), 'utf8');
    const script = path.join(pasta, 'abrir.ps1');
    fs.writeFileSync(script, '﻿' + PS, 'utf8');
    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', script, dados], { windowsHide: true });
    let erro = '';
    ps.stderr.on('data', (c) => { erro += c.toString(); });
    ps.on('error', reject);
    ps.on('close', (code) => (code === 0 ? resolve() : reject(new Error(erro.trim().split('\n').slice(-3).join(' ') || `PowerShell saiu com código ${code}`))));
  });
}

module.exports = { abrirEmailOutlook };
