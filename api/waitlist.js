// POST /api/waitlist  { name, email, use: 'pessoal' | 'empresa', plan, consent, website }
// Guarda quem entrou na lista de espera pelos planos (condição pré-Black Friday).
// Fica separado dos leads da varredura: chaves wl:<email> e o conjunto 'waitlist'.
// "website" é um campo escondido: pessoas não o preenchem, robôs costumam preencher.

const { config, send, clientIp, sha, redis, overLimit } = require('./_lib');

const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,}$/i;
const USES = ['pessoal', 'empresa'];
const PLANS = ['mensal', 'anual', 'empresas', 'outro'];

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

  // Robô: finge que deu certo e não grava nada.
  if (clean(body.website, 200)) return send(res, 200, { ok: true });

  const name = clean(body.name, 90);
  const email = clean(body.email, 254).toLowerCase();
  const use = USES.includes(body.use) ? body.use : '';
  const plan = PLANS.includes(body.plan) ? body.plan : 'outro';

  if (name.length < 2 || !/[a-zà-ÿ]/i.test(name)) return send(res, 400, { error: 'name', message: 'Escreva seu nome.' });
  if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'email', message: 'Confira o e-mail. Ele precisa ter o formato nome@dominio.com.' });
  if (!use) return send(res, 400, { error: 'use', message: 'Escolha se vai usar o Sumiço para dados pessoais ou da empresa.' });
  if (body.consent !== true) return send(res, 400, { error: 'consent', message: 'Marque a autorização para guardarmos seu contato.' });

  if (!cfg.redisUrl || !cfg.redisToken) return send(res, 503, { error: 'db', message: 'A lista está fora do ar agora. Tente de novo em alguns minutos.' });

  if (await overLimit(cfg, 'rl:wl:ip:' + sha(clientIp(req)).slice(0, 24), 10, 3600)) {
    return send(res, 429, { error: 'rate', message: 'Muitos cadastros deste endereço. Tente de novo em uma hora.' });
  }

  const now = Date.now();
  const at = new Date(now).toISOString();
  // Condição pré-Black Friday: vale para quem entra até 27/11/2026 às 23:59 (Brasília).
  const promo = now <= Date.parse('2026-11-27T23:59:59-03:00') ? 'pre-bf' : '';
  try {
    await redis(cfg, [
      ['HSET', 'wl:' + email, 'name', name, 'email', email, 'use', use, 'plan', plan, 'at', at, 'promo', promo],
      ['HSETNX', 'wl:' + email, 'first', at],
      ['ZADD', 'waitlist', String(now), email],
    ]);
  } catch (e) {
    console.error('waitlist store failed', e.message);
    return send(res, 502, { error: 'db', message: 'Não conseguimos salvar agora. Tente de novo em alguns minutos.' });
  }
  return send(res, 200, { ok: true });
};
