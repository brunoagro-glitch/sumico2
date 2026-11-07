// GET /api/admin — lista as varreduras e os leads. Exige o cabeçalho x-admin-password.

const { config, send, header, clientIp, sha, safeEqual, redis, overLimit } = require('./_lib');

// Custos de referência. Ficam guardados aqui e podem ser ajustados por variável de ambiente.
// HIBP: plano Pwned 1 (10 consultas por minuto), preço fixo mensal. Serper: 1 crédito por consulta
// de até 10 resultados; cada varredura faz 3 consultas (4 quando a cidade é informada).
const num = (k, d) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
function costRefs(cfg) {
  return {
    hibp: { active: !!cfg.hibp, plan: 'Pwned 1', usdMonthly: num('HIBP_USD_MONTHLY', 4.5), perMinute: 10 },
    serper: { creditsPerScanMin: 3, creditsPerScanMax: 4, freeCredits: num('SERPER_FREE_CREDITS', 2500), usdPer1k: num('SERPER_USD_PER_1K', 1) },
    usdBrl: num('USD_BRL', 5.4),
  };
}
// Início do mês corrente no horário de Brasília (UTC-3), em milissegundos.
function monthStartBR() {
  const now = new Date(Date.now() - 3 * 3600e3);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) + 3 * 3600e3;
}

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
    return send(res, 200, { ok: true, db: false, scans: [], leads: 0, costs: Object.assign(costRefs(cfg), { scansMonth: 0 }) });
  }

  try {
    const [ids, leadCount, scanCount, monthCount] = await redis(cfg, [
      ['ZRANGE', 'scans', '0', '299', 'REV'],
      ['ZCARD', 'leads'],
      ['ZCARD', 'scans'],
      ['ZCOUNT', 'scans', String(monthStartBR()), '+inf'],
    ]);
    let scans = [];
    if (ids && ids.length) {
      const [vals] = await redis(cfg, [['MGET', ...ids.map((id) => 'scan:' + id)]]);
      scans = (vals || []).filter(Boolean).map((v) => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean);
    }
    const costs = Object.assign(costRefs(cfg), { scansMonth: Number(monthCount) || 0 });
    return send(res, 200, { ok: true, db: true, leads: Number(leadCount) || 0, total: Number(scanCount) || 0, scans, costs });
  } catch (e) {
    return send(res, 502, { error: 'db', message: 'Não foi possível ler o banco: ' + e.message });
  }
};
