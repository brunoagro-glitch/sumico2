// GET /api/report?t=<token>
// Devolve o relatório completo de uma varredura (guardado por 30 dias).
// O token é aleatório (144 bits) e só vai no e-mail de quem pediu a varredura.

const { config, send, clientIp, sha, redis, overLimit } = require('./_lib');

const TOKEN_RE = /^[A-Za-z0-9_-]{24}$/;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'method' });
  }
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const cfg = config();
  const t = String((req.query && req.query.t) || '');
  if (!TOKEN_RE.test(t)) return send(res, 404, { error: 'not_found' });

  if (await overLimit(cfg, 'rl:report:ip:' + sha(clientIp(req)).slice(0, 24), 60, 3600)) {
    return send(res, 429, { error: 'rate', message: 'Muitas consultas. Tente de novo em uma hora.' });
  }

  let raw = null;
  try {
    const out = await redis(cfg, [['GET', 'report:' + t]]);
    raw = out && out[0];
  } catch (e) {
    return send(res, 503, { error: 'store', message: 'Não conseguimos abrir o relatório agora. Tente de novo em alguns minutos.' });
  }
  if (!raw) return send(res, 404, { error: 'not_found' });
  let data;
  try { data = JSON.parse(raw); } catch { return send(res, 404, { error: 'not_found' }); }
  return send(res, 200, { ok: true, ...data });
};
