// POST /api/scan  { name, email, city?, consent, token }
// Roda a varredura grátis, guarda o lead e envia o relatório por e-mail.

const crypto = require('crypto');
const { config, send, clientIp, sha, redis, overLimit, verifyTurnstile } = require('./_lib');
const { searchName, checkBreaches, sendReport } = require('./_scan');

const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,}$/i;

function clean(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method' });
  }
  const cfg = config();
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const name = clean(body.name, 90);
  const email = clean(body.email, 254).toLowerCase();
  const city = clean(body.city, 60);
  const ip = clientIp(req);

  const words = name.split(' ').filter((w) => w.length > 1);
  if (words.length < 2 || !/[a-zà-ÿ]/i.test(name)) return send(res, 400, { error: 'name', message: 'Informe nome e sobrenome.' });
  if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'email', message: 'Confira o e-mail. Ele precisa ter o formato nome@dominio.com.' });
  if (body.consent !== true) return send(res, 400, { error: 'consent', message: 'Marque a autorização para fazermos a busca.' });

  if (!(await verifyTurnstile(cfg, body.token, ip))) {
    return send(res, 403, { error: 'captcha', message: 'Não conseguimos confirmar que você é humano. Recarregue a página e tente de novo.' });
  }

  if (await overLimit(cfg, 'rl:scan:ip2:' + sha(ip).slice(0, 24), 10, 3600)) {
    return send(res, 429, { error: 'rate', message: 'Muitas varreduras deste endereço. Tente de novo em uma hora.' });
  }
  if (await overLimit(cfg, 'rl:scan:email:' + sha(email).slice(0, 24), 3, 86400)) {
    return send(res, 429, { error: 'rate', message: 'Este e-mail já pediu varreduras hoje. Tente de novo amanhã.' });
  }

  const [search, breaches] = await Promise.all([searchName(cfg, name, city), checkBreaches(cfg, email)]);
  const report = { search, breaches };
  const mail = await sendReport(cfg, email, name, report);

  const now = Date.now();
  const id = now.toString(36) + '-' + crypto.randomBytes(4).toString('hex');
  const record = {
    id, at: new Date(now).toISOString(), name, email, city,
    found: search.total || 0,
    groups: (search.groups || []).map((g) => ({ id: g.id, n: g.items.length })),
    breaches: breaches.enabled ? breaches.breaches.length : null,
    searchError: !!search.error, searchDetail: search.errorDetail || '', breachError: !!breaches.error,
    mail: mail.sent ? 'enviado' : (mail.reason || 'erro'), mailDetail: mail.detail || '',
  };
  let stored = false;
  try {
    const out = await redis(cfg, [
      ['SET', 'scan:' + id, JSON.stringify(record)],
      ['ZADD', 'scans', String(now), id],
      ['HSET', 'lead:' + email, 'name', name, 'email', email, 'city', city, 'last', record.at],
      ['HINCRBY', 'lead:' + email, 'scans', '1'],
      ['ZADD', 'leads', String(now), email],
    ]);
    stored = !!out;
  } catch (e) {
    console.error('redis store failed', e.message);
  }

  return send(res, 200, {
    ok: true,
    search,
    breaches,
    mail: { sent: mail.sent, reason: mail.reason || null, detail: mail.detail || null },
    stored,
  });
};
