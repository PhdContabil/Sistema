// Robô NFS-e do Núcleo Contábil — roda no PC de quem emite (precisa do Google Chrome).
// O Núcleo (system-contabilidade.vercel.app) chama este serviço em http://localhost:3199
// para abrir o Emissor Nacional, fazer login e PREENCHER a nota — igual ao botão "Salvar" do
// form emitirnota do Access. O robô PARA antes de emitir: quem clica em "Emitir" é a pessoa.
//
//   node robo-nucleo.js        (ou iniciar-robo-nucleo.bat)
//
// Segurança: só escuta em 127.0.0.1, só aceita chamadas da origem do Núcleo e não grava senha
// em disco (a senha chega do Núcleo a cada emissão e fica só na memória).

const http = require('http');
const { preparar, codigoServico, hoje } = require('./emissor');
const { guiaDAS } = require('./das');

const PORTA = +(process.env.ROBO_PORTA || 3199);
// Só o site do Núcleo manda comandos. localhost só com ROBO_DEV=1 (testes de desenvolvimento).
const ORIGENS = ['https://system-contabilidade.vercel.app', ...(process.env.ROBO_DEV === '1' ? ['http://localhost:3000'] : [])];
const jobs = new Map();
const ATIVOS = ['preparando', 'login', 'aguardando_login', 'preenchendo', 'aguardando_confirmacao'];

function cors(req, res) {
  const o = req.headers.origin || '';
  if (ORIGENS.includes(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Vary', 'Origin');
  }
  // Sem Origin (ex.: <img> do print, curl local) só pode LER; comandos (POST) exigem o site do Núcleo.
  return ORIGENS.includes(o) || (!o && req.method === 'GET');
}
const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const publico = (j) => { const { creds, ctx, printB64, ...p } = j; void creds; void ctx; return { ...p, temPrint: !!printB64 }; };

http.createServer(async (req, res) => {
  const permitido = cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(permitido ? 204 : 403); return res.end(); }
  if (!permitido) return send(res, 403, { erro: 'origem não permitida' });
  const u = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && u.pathname === '/status') {
      return send(res, 200, { ok: true, versao: 5, hoje: hoje(), jobs: [...jobs.values()].slice(-20).map(publico) });
    }
    let m;
    if (req.method === 'GET' && (m = u.pathname.match(/^\/jobs\/([A-Z0-9]+)$/))) {
      const j = jobs.get(m[1]); return j ? send(res, 200, publico(j)) : send(res, 404, { erro: 'job não encontrado' });
    }
    if (req.method === 'GET' && (m = u.pathname.match(/^\/jobs\/([A-Z0-9]+)\/print$/))) {
      const j = jobs.get(m[1]); return j && j.printB64 ? send(res, 200, { jpeg: j.printB64 }) : send(res, 404, { erro: 'sem print' });
    }
    if (req.method === 'POST' && (m = u.pathname.match(/^\/jobs\/([A-Z0-9]+)\/cancelar$/))) {
      const j = jobs.get(m[1]); if (!j) return send(res, 404, { erro: 'job não encontrado' });
      j.cancel = true; try { if (j.ctx) await j.ctx.close(); } catch {}
      if (ATIVOS.includes(j.status)) j.status = 'cancelada';
      return send(res, 200, publico(j));
    }
    if (req.method === 'POST' && u.pathname === '/preparar') {
      const chunks = []; for await (const c of req) chunks.push(c);
      const b = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      const erros = [];
      if (!(+b.cod > 0)) erros.push('MEI inválido');
      if (!(+b.valor > 0)) erros.push('valor inválido');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.data || '')) erros.push('data inválida'); else if (b.data > hoje()) erros.push('data futura não permitida');
      const tom = String(b.tomadorCnpj || '').replace(/\D/g, '');
      if (!(tom.length === 14 || tom.length === 11)) erros.push('CNPJ/CPF do tomador (salão) inválido');
      if ([...jobs.values()].some((j) => ATIVOS.includes(j.status))) erros.push('já existe uma emissão em andamento — conclua ou cancele');
      if (erros.length) return send(res, 422, { erro: erros.join(' · ') });
      const id = 'E' + Date.now().toString(36).toUpperCase();
      const job = {
        id, cod: +b.cod, razao: b.razao || '', data: b.data, valor: +b.valor, tomadorCnpj: tom,
        descricao: String(b.descricao || '').slice(0, 2000), municipio: b.municipio || '', uf: b.uf || '',
        codigoativmunic: b.codigoativmunic || '', servicoBusca: b.servicoBusca || codigoServico(b.codigoativmunic || ''),
        usuario: b.usuario || '', status: 'preparando', passos: [], criado: new Date().toISOString(),
        creds: b.creds || null,
      };
      jobs.set(id, job);
      const ctl = {
        log: (msg) => job.passos.push({ t: new Date().toISOString(), msg }),
        setStatus: (s) => { job.status = s; },
        cancelado: () => job.cancel === true,
        setPrint: (b64) => { job.printB64 = b64; },
        onPage: (ctx) => { job.ctx = ctx; ctx.on('close', () => { if (job.status === 'aguardando_confirmacao') { job.status = 'fechada'; job.passos.push({ t: new Date().toISOString(), msg: 'Janela do Chrome fechada.' }); } }); },
      };
      preparar(job, job.creds, ctl)
        .catch((e) => { job.status = 'erro'; job.erro = e.message; })
        .finally(() => { job.creds = null; });   // descarta a senha da memória
      return send(res, 201, publico(job));
    }
    if (req.method === 'POST' && u.pathname === '/das') {
      const chunks = []; for await (const c of req) chunks.push(c);
      const b = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      const c = b.creds || {};
      if (!(+b.cod > 0)) return send(res, 422, { erro: 'MEI inválido' });
      if (!c.cnpj || !c.cpf || !c.cod) return send(res, 422, { erro: 'Falta CNPJ, CPF ou código de acesso do Simples Nacional na senha da empresa.' });
      if ([...jobs.values()].some((j) => ATIVOS.includes(j.status))) return send(res, 422, { erro: 'já existe um robô em andamento — conclua ou cancele' });
      const id = 'D' + Date.now().toString(36).toUpperCase();
      const job = { id, tipo: 'das', cod: +b.cod, razao: b.razao || '', usuario: b.usuario || '', status: 'preparando', passos: [], criado: new Date().toISOString() };
      jobs.set(id, job);
      const ctl = {
        log: (msg) => job.passos.push({ t: new Date().toISOString(), msg }),
        setStatus: (s) => { job.status = s; },
        cancelado: () => job.cancel === true,
        setPrint: (b64) => { job.printB64 = b64; },
        onPage: (ctx) => { job.ctx = ctx; ctx.on('close', () => { if (ATIVOS.includes(job.status)) { job.status = 'fechada'; } }); },
      };
      guiaDAS(job, c, ctl).catch((e) => { job.status = 'erro'; job.erro = e.message; });
      return send(res, 201, publico(job));
    }
    return send(res, 404, { erro: 'rota desconhecida' });
  } catch (e) {
    return send(res, 500, { erro: String(e.message || e) });
  }
}).listen(PORTA, '127.0.0.1', () => console.log(`Robô NFS-e do Núcleo em http://localhost:${PORTA} (deixe esta janela aberta)`));
