// Lógica da varredura grátis: busca do nome (Serper), vazamentos do e-mail (HIBP)
// e o e-mail com o relatório (Resend).

const { fetchJson, esc } = require('./_lib');

const STOP = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'la', 'van', 'von']);

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function nameTokens(name) {
  return norm(name).split(/[^a-z]+/).filter((w) => w.length > 1 && !STOP.has(w));
}

// Categorias, da mais grave para a menos grave.
const CATEGORIES = [
  {
    id: 'consulta', label: 'Sites de consulta e cadastros', action: 'Removível com pedido LGPD',
    domains: ['escavador.com', 'consultasocio.com', 'cnpj.biz', 'casadosdados.com.br', 'empresascnpj.com', 'cnpj.info', 'cnpjs.rocks', 'econodata.com.br', 'solutudo.com.br', 'informecadastral.com.br', 'cadastroempresa.com.br', 'consultacpf', 'buscacpf', 'cpfcnpj', 'dadosbrasil', 'qualempresa', 'socios.com.br', 'empresaqui.com.br', 'serasaexperian', 'boavista', 'fichadeempresa', 'cnpja.com', 'speedio.com.br', 'transparencia.cc', 'listadeempresas', 'guiadeempresas'],
    words: ['cpf', 'cnpj', 'sócio', 'socio', 'consulta', 'empresa'],
  },
  {
    id: 'telefone', label: 'Listas telefônicas e guias', action: 'Removível com pedido LGPD',
    domains: ['telelistas.net', 'listamais.com.br', 'guiamais.com.br', 'apontador.com.br', 'achei.com.br', 'telefone.', 'lista-telefonica', 'listatelefonica', 'encontra', 'guiato', 'kekanto'],
    words: ['telefone', 'endereço', 'endereco', 'whatsapp'],
  },
  {
    id: 'processos', label: 'Processos e diários oficiais', action: 'Registro público: em geral não é removível',
    domains: ['jusbrasil.com.br', 'jus.br', 'jusdecisum', 'diariooficial', 'in.gov.br', 'imprensaoficial', 'diarios.', 'migalhas.com.br', 'conjur.com.br', 'portaldatransparencia.gov.br', 'gov.br'],
    words: [],
  },
  {
    id: 'social', label: 'Redes sociais e perfis', action: 'Você controla pela própria conta',
    domains: ['facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'tiktok.com', 'youtube.com', 'threads.net', 'pinterest.', 'lattes.cnpq.br', 'github.com', 'medium.com', 'soundcloud.com', 'kwai.com'],
    words: [],
  },
];
const OTHER = { id: 'outros', label: 'Outras páginas que citam seu nome', action: 'Avaliamos caso a caso' };

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function classify(item) {
  const host = hostOf(item.link);
  for (const c of CATEGORIES) {
    if (c.domains.some((d) => host.includes(d))) return c;
  }
  // Sinais no texto só valem para consulta/telefone.
  const text = norm(item.title + ' ' + item.snippet);
  for (const c of CATEGORIES.slice(0, 2)) {
    if (c.words.some((w) => text.includes(norm(w)))) return c;
  }
  return OTHER;
}

function matchesName(item, tokens) {
  if (tokens.length === 0) return false;
  const text = norm([item.title, item.snippet, item.link].join(' '));
  const first = tokens[0], last = tokens[tokens.length - 1];
  return text.includes(first) && (tokens.length === 1 || text.includes(last));
}

async function serperSearch(key, q) {
  const r = await fetchJson('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, gl: 'br', hl: 'pt-br', num: 20 }),
  }, 8000);
  if (!r.ok) {
    const msg = (r.data && (r.data.message || r.data.error || r.data.raw)) || '';
    throw new Error('Serper ' + r.status + (msg ? ': ' + String(msg).slice(0, 150) : ''));
  }
  return (r.data && r.data.organic) || [];
}

async function searchName(cfg, name, city) {
  if (!cfg.serper) return { enabled: false, total: 0, groups: [] };
  const quoted = '"' + name.replace(/"/g, '') + '"';
  const queries = [quoted, quoted + ' CPF', quoted + ' telefone OR endereço'];
  if (city) queries.push(quoted + ' ' + city);

  const settled = await Promise.allSettled(queries.map((q) => serperSearch(cfg.serper, q)));
  const failed = settled.filter((s) => s.status === 'rejected').length;
  if (failed === settled.length) {
    const detail = String(settled[0].reason && settled[0].reason.message || settled[0].reason).slice(0, 200);
    console.error('busca falhou:', detail);
    return { enabled: true, error: true, errorDetail: detail, total: 0, groups: [] };
  }

  const tokens = nameTokens(name);
  const seen = new Set();
  const items = [];
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    for (const o of s.value) {
      if (!o.link || seen.has(o.link)) continue;
      const item = { title: String(o.title || '').slice(0, 160), snippet: String(o.snippet || '').slice(0, 260), link: o.link };
      if (!matchesName(item, tokens)) continue;
      seen.add(o.link);
      item.host = hostOf(o.link);
      items.push(item);
    }
  }

  const byId = {};
  for (const it of items) {
    const c = classify(it);
    (byId[c.id] = byId[c.id] || { id: c.id, label: c.label, action: c.action, items: [] }).items.push(it);
  }
  const order = CATEGORIES.map((c) => c.id).concat(OTHER.id);
  const groups = order.filter((id) => byId[id]).map((id) => byId[id]);
  return { enabled: true, total: items.length, groups };
}

const DATA_PT = {
  'Email addresses': 'e-mail', Passwords: 'senha', 'Phone numbers': 'telefone', Names: 'nome',
  'Physical addresses': 'endereço', 'Dates of birth': 'data de nascimento', 'IP addresses': 'IP',
  Usernames: 'usuário', 'Government issued IDs': 'documentos (CPF/RG)', Genders: 'gênero',
  'Credit cards': 'cartão de crédito', 'Partial credit card data': 'dados de cartão', 'Geographic locations': 'localização',
  'Job titles': 'cargo', Employers: 'empregador', 'Social media profiles': 'perfis sociais',
  'Purchases': 'compras', 'Bank account numbers': 'conta bancária', 'Password hints': 'dica de senha',
};

async function checkBreaches(cfg, email) {
  if (!cfg.hibp) return { enabled: false, breaches: [] };
  const url = 'https://haveibeenpwned.com/api/v3/breachedaccount/' + encodeURIComponent(email) + '?truncateResponse=false';
  try {
    const r = await fetchJson(url, { headers: { 'hibp-api-key': cfg.hibp, 'user-agent': 'Sumico-Varredura' } }, 8000);
    if (r.status === 404) return { enabled: true, breaches: [] };
    if (!r.ok || !Array.isArray(r.data)) return { enabled: true, error: true, breaches: [] };
    const breaches = r.data
      .map((b) => ({
        name: b.Title || b.Name,
        domain: b.Domain || '',
        date: b.BreachDate || '',
        data: (b.DataClasses || []).map((d) => DATA_PT[d] || d),
        password: (b.DataClasses || []).includes('Passwords'),
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { enabled: true, breaches };
  } catch {
    return { enabled: true, error: true, breaches: [] };
  }
}

// ---------- E-mail ----------
function firstName(name) {
  const w = String(name).trim().split(/\s+/)[0] || '';
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function fmtDate(d) {
  const m = /^(\d{4})-(\d{2})/.exec(d || '');
  if (!m) return d || '';
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return months[Number(m[2]) - 1] + ' ' + m[1];
}

function buildEmail(cfg, name, report) {
  const s = report.search, b = report.breaches;
  const fn = esc(firstName(name));
  const C = { bg: '#f4f5f7', card: '#ffffff', fg: '#0b0d14', fg2: '#4b5262', line: '#e3e6ec', accent: '#1f63e0', warn: '#a86a10', bad: '#c2393d' };
  const parts = [];

  parts.push(`<p style="margin:0 0 16px;font-size:16px;line-height:1.6">Oi, ${fn}. Aqui está o que encontramos sobre <b>${esc(name)}</b> na internet aberta${b.enabled ? ' e em bases de vazamentos' : ''}.</p>`);

  const tiles = [];
  if (s.enabled) tiles.push([s.total, 'páginas citando seu nome']);
  if (b.enabled) tiles.push([b.breaches.length, b.breaches.length === 1 ? 'vazamento com seu e-mail' : 'vazamentos com seu e-mail']);
  if (tiles.length) {
    parts.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr>' +
      tiles.map(([n, l]) => `<td style="padding:16px;border:1px solid ${C.line};border-radius:10px;background:${C.card}"><div style="font:600 28px/1 Menlo,monospace;color:${C.fg}">${n}</div><div style="margin-top:6px;font-size:13px;color:${C.fg2}">${l}</div></td>`).join('<td width="12"></td>') +
      '</tr></table>');
  }

  if (s.enabled && s.total === 0 && !s.error) {
    parts.push(`<p style="font-size:14px;color:${C.fg2}">Não encontramos páginas citando seu nome completo nas buscas desta varredura. Isso é bom, mas não quer dizer que seus dados não estejam em bases fechadas.</p>`);
  }
  if (s.error) parts.push(`<p style="font-size:14px;color:${C.warn}">A busca pelo nome falhou desta vez. Tente a varredura de novo mais tarde.</p>`);

  for (const g of s.groups || []) {
    parts.push(`<h3 style="margin:28px 0 4px;font-size:16px;color:${C.fg}">${esc(g.label)} <span style="color:${C.fg2};font-weight:400">· ${g.items.length}</span></h3><p style="margin:0 0 10px;font-size:12px;color:${C.fg2}">${esc(g.action)}</p>`);
    for (const it of g.items.slice(0, 12)) {
      parts.push(`<div style="padding:10px 0;border-top:1px solid ${C.line}"><a href="${esc(it.link)}" style="color:${C.accent};font-size:14px;text-decoration:none">${esc(it.title || it.host)}</a><div style="font:12px Menlo,monospace;color:${C.fg2};margin-top:2px">${esc(it.host)}</div>${it.snippet ? `<div style="font-size:13px;color:${C.fg2};margin-top:4px">${esc(it.snippet)}</div>` : ''}</div>`);
    }
    if (g.items.length > 12) parts.push(`<p style="font-size:12px;color:${C.fg2}">E mais ${g.items.length - 12} nesta categoria.</p>`);
  }

  if (b.enabled) {
    parts.push(`<h3 style="margin:28px 0 8px;font-size:16px;color:${C.fg}">Vazamentos com o seu e-mail</h3>`);
    if (b.error) parts.push(`<p style="font-size:14px;color:${C.warn}">A consulta de vazamentos falhou desta vez.</p>`);
    else if (b.breaches.length === 0) parts.push(`<p style="font-size:14px;color:${C.fg2}">Seu e-mail não aparece nas bases de vazamentos conhecidas. Ótimo sinal.</p>`);
    for (const x of b.breaches.slice(0, 15)) {
      parts.push(`<div style="padding:10px 0;border-top:1px solid ${C.line}"><b style="font-size:14px;color:${C.fg}">${esc(x.name)}</b> <span style="font-size:12px;color:${C.fg2}">${esc(fmtDate(x.date))}</span><div style="font-size:13px;color:${C.fg2};margin-top:4px">Dados expostos: ${esc(x.data.join(', '))}</div>${x.password ? `<div style="font-size:13px;color:${C.bad};margin-top:4px">Sua senha vazou aqui. Troque-a em todo lugar onde usa a mesma.</div>` : ''}</div>`);
    }
  }

  parts.push(`<div style="margin:32px 0 8px;padding:20px;border-radius:12px;background:${C.fg};color:#fff"><b style="font-size:16px">Quer que a gente peça a remoção?</b><p style="margin:8px 0 16px;font-size:14px;color:#c9ceda">O Sumiço envia os pedidos de exclusão com base na LGPD e repete a varredura todo mês. Você está na lista de espera com preço de fundador.</p><a href="${esc(cfg.siteUrl)}/#precos" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#fff;color:${C.fg};font-weight:600;font-size:14px;text-decoration:none">Ver planos</a></div>`);

  parts.push(`<p style="margin-top:24px;font-size:12px;color:${C.fg2}">Você recebeu este e-mail porque pediu uma varredura grátis em ${esc(cfg.siteUrl.replace(/^https?:\/\//, ''))}. Se não foi você, ignore. Para apagar seus dados, responda pedindo a exclusão.</p>`);

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:${C.bg};font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${C.fg}"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="font-weight:600;font-size:20px;margin-bottom:24px">Sumiço</div><div style="background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:28px">${parts.join('')}</div></div></body></html>`;

  const lines = [`Oi, ${firstName(name)}. Relatório da varredura grátis do Sumiço para "${name}".`, ''];
  if (s.enabled) lines.push(`Páginas citando seu nome: ${s.total}`);
  if (b.enabled) lines.push(`Vazamentos com seu e-mail: ${b.breaches.length}`);
  for (const g of s.groups || []) {
    lines.push('', `${g.label} (${g.items.length}) - ${g.action}`);
    for (const it of g.items.slice(0, 12)) lines.push(`- ${it.title || it.host}: ${it.link}`);
  }
  for (const x of b.breaches || []) lines.push(`- Vazamento ${x.name} (${fmtDate(x.date)}): ${x.data.join(', ')}`);
  lines.push('', `Planos: ${cfg.siteUrl}/#precos`);

  const n = (s.total || 0) + (b.breaches ? b.breaches.length : 0);
  const subject = n > 0 ? `${firstName(name)}, encontramos ${n} ${n === 1 ? 'item' : 'itens'} sobre você` : `${firstName(name)}, sua varredura grátis está pronta`;
  return { subject, html, text: lines.join('\n') };
}

async function sendReport(cfg, to, name, report) {
  if (!cfg.resend) return { sent: false, reason: 'not_configured' };
  const mail = buildEmail(cfg, name, report);
  try {
    const r = await fetchJson('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.resend, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: cfg.resendFrom, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
    }, 8000);
    if (r.ok) return { sent: true, id: r.data && r.data.id };
    const msg = 'Resend ' + r.status + ': ' + ((r.data && (r.data.message || r.data.name)) || '');
    console.error('envio falhou:', msg);
    return { sent: false, reason: r.status === 403 ? 'restricted' : 'error', detail: String(msg).slice(0, 200) };
  } catch (e) {
    return { sent: false, reason: 'error', detail: String(e.message || e).slice(0, 200) };
  }
}

module.exports = { searchName, checkBreaches, sendReport, buildEmail, nameTokens, classify, matchesName, norm };
