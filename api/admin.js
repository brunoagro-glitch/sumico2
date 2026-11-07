// GET /api/admin — lista as varreduras e os leads. Exige o cabeçalho x-admin-password.

const { config, send, header, clientIp, sha, safeEqual, redis, overLimit } = require('./_lib');

module.exports = async (req, res) => {
  const cfg = config();
  if (!cfg.adminPassword) return send(res, 503, { error: 'not_configured', message: 'Defina ADMIN_PASSWORD nas variáveis da Vercel.' });

  const ipKey = 'rl:admin:' + sha(clientIp(req)).slice(0, 24);
  const given = header(req, 'x-admin-password');
  if (!given || !safeEqual(given, cfg.adminPassword)) {
    if (await overLimit(cfg, ipKey, 10, 900)) return send(res, 429, { error: 'rate', message: 'Muitas tentativas. Espere 15 minutos.' });
    return send(res, 401, { error: 'auth', message: 'Senha incorreta.' });
  }

  if (!cfg.redisUrl || !cfg.redisToken) {
    return send(res, 200, { ok: true, db: false, scans: [], leads: 0 });
  }

  try {
    const [ids, leadCount, scanCount] = await redis(cfg, [
      ['ZRANGE', 'scans', '0', '299', 'REV'],
      ['ZCARD', 'leads'],
      ['ZCARD', 'scans'],
    ]);
    let scans = [];
    if (ids && ids.length) {
      const [vals] = await redis(cfg, [['MGET', ...ids.map((id) => 'scan:' + id)]]);
      scans = (vals || []).filter(Boolean).map((v) => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean);
    }
    return send(res, 200, { ok: true, db: true, leads: Number(leadCount) || 0, total: Number(scanCount) || 0, scans });
  } catch (e) {
    return send(res, 502, { error: 'db', message: 'Não foi possível ler o banco: ' + e.message });
  }
};
