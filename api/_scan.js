// Lógica da varredura grátis: busca do nome (Serper), vazamentos do e-mail
// (HIBP ou XposedOrNot) e o e-mail com o relatório (Resend).

const { fetchJson, esc, sha, redis } = require('./_lib');
const { domainToUnicode } = require('url');

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

async function serperSearch(key, payload) {
  const r = await fetchJson('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 8000);
  if (!r.ok) {
    const msg = (r.data && (r.data.message || r.data.error || r.data.raw)) || '';
    const err = new Error('Serper ' + r.status + (msg ? ': ' + String(msg).slice(0, 150) : ''));
    err.status = r.status;
    throw err;
  }
  return (r.data && r.data.organic) || [];
}

// Formatos de consulta, do mais preciso ao mais simples. A conta grátis do Serper
// recusa alguns padrões (erro 400); nesse caso descemos para o próximo formato.
const MODES = [
  { quotes: true, or: true, params: { gl: 'br', hl: 'pt-br', num: 10 } },
  { quotes: true, or: false, params: { gl: 'br', hl: 'pt-br', num: 10 } },
  { quotes: false, or: false, params: { gl: 'br', hl: 'pt-br', num: 10 } },
  { quotes: false, or: false, params: {} },
];

function buildQueries(mode, name, city) {
  const n = name.replace(/"/g, '');
  const base = mode.quotes ? '"' + n + '"' : n;
  const qs = [base, base + ' CPF', base + (mode.or ? ' telefone OR endereço' : ' telefone endereço')];
  if (city) qs.push(base + ' ' + city);
  return qs.map((q) => Object.assign({ q }, mode.params));
}

async function searchName(cfg, name, city) {
  if (!cfg.serper) return { enabled: false, total: 0, groups: [] };

  // Descobre o formato aceito com a primeira consulta e roda as demais nele.
  let mode = -1, first = null, lastErr = null;
  for (let i = 0; i < MODES.length; i++) {
    try {
      first = await serperSearch(cfg.serper, buildQueries(MODES[i], name, city)[0]);
      mode = i;
      break;
    } catch (e) {
      lastErr = e;
      if (e.status !== 400) break;
    }
  }
  if (mode < 0) {
    const detail = String((lastErr && lastErr.message) || lastErr).slice(0, 200);
    console.error('busca falhou:', detail);
    return { enabled: true, error: true, errorDetail: detail, total: 0, groups: [] };
  }
  if (mode > 0) console.warn('Serper aceitou só o formato', mode);

  const rest = buildQueries(MODES[mode], name, city).slice(1);
  const settled = [{ status: 'fulfilled', value: first }].concat(
    await Promise.allSettled(rest.map((p) => serperSearch(cfg.serper, p)))
  );

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
  return { enabled: true, mode, total: items.length, groups };
}

const DATA_PT = {
  'Email addresses': 'e-mail', Passwords: 'senha', 'Phone numbers': 'telefone', Names: 'nome',
  'Physical addresses': 'endereço', 'Dates of birth': 'data de nascimento', 'IP addresses': 'IP',
  Usernames: 'usuário', 'Government issued IDs': 'documentos (CPF/RG)', Genders: 'gênero',
  'Credit cards': 'cartão de crédito', 'Partial credit card data': 'dados de cartão', 'Geographic locations': 'localização',
  'Job titles': 'cargo', Employers: 'empregador', 'Social media profiles': 'perfis sociais',
  'Purchases': 'compras', 'Bank account numbers': 'conta bancária', 'Password hints': 'dica de senha',
};

// ---------- Vazamentos ----------
// Fonte escolhida por BREACH_PROVIDER: auto (padrão: HIBP se houver chave, senão XposedOrNot),
// xon, hibp ou off.
const PROVIDERS = { hibp: 'Have I Been Pwned', xon: 'XposedOrNot' };

function breachProvider(cfg) {
  const p = cfg.breachProvider;
  if (p === 'off') return '';
  if (p === 'xon') return 'xon';
  if (p === 'hibp') return cfg.hibp ? 'hibp' : '';
  return cfg.hibp ? 'hibp' : 'xon';
}

function toBreach(name, domain, date, classes) {
  const list = classes.map((d) => String(d).trim()).filter(Boolean);
  return { name, domain: domain || '', date: date || '', data: list.map((d) => DATA_PT[d] || d), password: list.includes('Passwords') };
}

const byDateDesc = (a, b) => String(b.date).localeCompare(String(a.date));

// Cada função devolve { breaches } ou { error: true } ou { unavailable: true } (limite atingido).
async function queryHibp(cfg, email) {
  const url = 'https://haveibeenpwned.com/api/v3/breachedaccount/' + encodeURIComponent(email) + '?truncateResponse=false';
  const r = await fetchJson(url, { headers: { 'hibp-api-key': cfg.hibp, 'user-agent': 'Sumico-Varredura' } }, 8000);
  if (r.status === 404) return { breaches: [] };
  if (r.status === 429) return { unavailable: true };
  if (!r.ok || !Array.isArray(r.data)) return { error: true, detail: 'HIBP ' + r.status };
  return { breaches: r.data.map((b) => toBreach(b.Title || b.Name, b.Domain, b.BreachDate, b.DataClasses || [])).sort(byDateDesc) };
}

async function checkXposedOrNot(email) {
  const url = 'https://api.xposedornot.com/v1/breach-analytics?email=' + encodeURIComponent(email);
  const r = await fetchJson(url, { headers: { 'user-agent': 'Sumico-Varredura', accept: 'application/json' } }, 8000);
  if (r.status === 429) return { unavailable: true };
  // E-mail sem vazamentos: a API responde 200 com campos nulos (ou 404 / {"Error":"Not found"}).
  if (r.status === 404) return { breaches: [] };
  if (!r.ok || !r.data || typeof r.data !== 'object') return { error: true, detail: 'XposedOrNot ' + r.status };
  if (r.data.Error) return /not found/i.test(r.data.Error) ? { breaches: [] } : { error: true, detail: 'XposedOrNot: ' + String(r.data.Error).slice(0, 100) };
  const list = (r.data.ExposedBreaches && r.data.ExposedBreaches.breaches_details) || [];
  if (!Array.isArray(list)) return { error: true, detail: 'XposedOrNot: formato inesperado' };
  return {
    breaches: list
      .map((b) => toBreach(b.breach, b.domain, String(b.xposed_date || ''), String(b.xposed_data || '').split(';')))
      .sort(byDateDesc),
  };
}

const CACHE_TTL = 30 * 86400; // 30 dias
const COOLDOWN_TTL = 10 * 60; // depois de um 429, não insiste por 10 minutos

async function checkBreaches(cfg, email) {
  const provider = breachProvider(cfg);
  if (!provider) return { enabled: false, breaches: [] };
  const base = { enabled: true, provider, source: PROVIDERS[provider] };
  const cacheKey = 'breach:' + provider + ':' + sha(email).slice(0, 32);
  const coolKey = 'breach:cooldown:' + provider;

  try {
    const [cached, cooling] = (await redis(cfg, [['GET', cacheKey], ['EXISTS', coolKey]])) || [];
    if (cached) return Object.assign(base, { breaches: JSON.parse(cached), cached: true });
    if (Number(cooling) > 0) return Object.assign(base, { unavailable: true, breaches: [] });
  } catch (e) {
    console.warn('cache de vazamentos indisponível:', e.message);
  }

  let out;
  try {
    out = provider === 'hibp' ? await queryHibp(cfg, email) : await checkXposedOrNot(email);
  } catch (e) {
    out = { error: true, detail: String(e.message || e).slice(0, 100) };
  }

  if (out.unavailable) {
    console.warn('vazamentos: limite atingido em', provider);
    try { await redis(cfg, [['SET', coolKey, '1', 'EX', String(COOLDOWN_TTL)]]); } catch {}
    return Object.assign(base, { unavailable: true, breaches: [] });
  }
  if (out.error) {
    console.error('vazamentos falhou:', out.detail);
    return Object.assign(base, { error: true, breaches: [] });
  }
  try { await redis(cfg, [['SET', cacheKey, JSON.stringify(out.breaches), 'EX', String(CACHE_TTL)]]); } catch {}
  return Object.assign(base, { breaches: out.breaches });
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

// E-mail curto de propósito: só o resumo e UM link para o relatório no nosso domínio.
// Dezenas de links para sites de terceiros (Serasa, Escavador, LinkedIn...) fazem o
// Outlook/Hotmail tratar a mensagem como phishing e descartá-la em silêncio.
function buildEmail(cfg, name, report, reportUrl) {
  const s = report.search, b = report.breaches;
  const bOk = b.enabled && !b.error && !b.unavailable;
  const fn = firstName(name);
  const C = { bg: '#f4f5f7', card: '#ffffff', fg: '#0b0d14', fg2: '#4b5262', line: '#e3e6ec', bad: '#c2393d' };
  const site = domainToUnicode(cfg.siteUrl.replace(/^https?:\/\//, '').replace(/^www\./, ''));
  const pw = bOk ? b.breaches.filter((x) => x.password).length : 0;

  // Linhas do resumo: [número, rótulo]
  const rows = [];
  if (bOk) rows.push([b.breaches.length, b.breaches.length === 1 ? 'Vazamento com o seu e-mail' : 'Vazamentos com o seu e-mail']);
  for (const g of s.groups || []) rows.push([g.items.length, g.label]);

  const notes = [];
  if (pw) notes.push(pw === 1 ? 'Sua senha aparece em 1 vazamento. Troque-a onde usar a mesma.' : `Sua senha aparece em ${pw} vazamentos. Troque-a onde usar a mesma.`);
  if (s.error) notes.push('A busca pelo nome falhou desta vez. Faça uma nova varredura mais tarde.');
  if (b.unavailable) notes.push('A consulta de vazamentos estava indisponível. Faça uma nova varredura mais tarde.');
  if (s.enabled && !s.error && s.total === 0) notes.push('Não achamos páginas abertas com o seu nome completo. Bom sinal.');
  if (bOk && b.breaches.length === 0) notes.push('Seu e-mail não aparece nas bases de vazamentos conhecidas.');

  const parts = [];
  parts.push(`<p style="margin:0 0 20px;font-size:16px;line-height:1.6">Oi, ${esc(fn)}. Sua varredura grátis terminou. Este é o resumo do que encontramos sobre <b>${esc(name)}</b>:</p>`);
  if (rows.length) {
    parts.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px">' +
      rows.map(([n, l]) => `<tr><td style="padding:10px 0;border-top:1px solid ${C.line};font-size:14px;color:${C.fg}">${esc(l)}</td><td align="right" style="padding:10px 0;border-top:1px solid ${C.line};font:600 16px Menlo,monospace;color:${C.fg}">${n}</td></tr>`).join('') +
      '</table>');
  }
  for (const t of notes) parts.push(`<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:${t.startsWith('Sua senha') ? C.bad : C.fg2}">${esc(t)}</p>`);
  if (reportUrl) {
    parts.push(`<p style="margin:24px 0 8px"><a href="${esc(reportUrl)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:${C.fg};color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">Ver relatório completo</a></p>`);
    parts.push(`<p style="margin:0;font-size:12px;color:${C.fg2}">O relatório mostra cada página e vazamento, com o que fazer em cada caso. O link vale por 30 dias e é só seu: não o encaminhe.</p>`);
  }
  parts.push(`<p style="margin:28px 0 0;font-size:12px;line-height:1.5;color:${C.fg2}">Você recebeu este e-mail porque pediu uma varredura grátis em ${esc(site)}. Se não foi você, ignore. Para apagar seus dados, responda pedindo a exclusão.</p>`);

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:${C.bg};font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${C.fg}"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="font-weight:600;font-size:20px;margin-bottom:24px">Sumiço</div><div style="background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:28px">${parts.join('')}</div></div></body></html>`;

  const lines = [`Oi, ${fn}. Sua varredura grátis terminou. Resumo do que encontramos sobre "${name}":`, ''];
  for (const [n, l] of rows) lines.push(`- ${l}: ${n}`);
  if (notes.length) lines.push('', ...notes);
  if (reportUrl) lines.push('', 'Relatório completo (vale por 30 dias, não encaminhe):', reportUrl);
  lines.push('', `Você recebeu este e-mail porque pediu uma varredura grátis em ${site}. Se não foi você, ignore.`);

  const n = (s.total || 0) + (bOk ? b.breaches.length : 0);
  const subject = n > 0 ? `${fn}, encontramos ${n} ${n === 1 ? 'item' : 'itens'} sobre você` : `${fn}, sua varredura grátis está pronta`;
  return { subject, html, text: lines.join('\n') };
}

async function sendReport(cfg, to, name, report, reportUrl) {
  if (!cfg.resend) return { sent: false, reason: 'not_configured' };
  const mail = buildEmail(cfg, name, report, reportUrl);
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

module.exports = { searchName, checkBreaches, checkXposedOrNot, breachProvider, PROVIDERS, sendReport, buildEmail, nameTokens, classify, matchesName, norm };
