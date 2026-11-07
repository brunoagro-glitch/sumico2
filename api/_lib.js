// Utilitários compartilhados pelas funções da Vercel.
// Arquivos em /api que começam com "_" não viram endpoints.

const crypto = require('crypto');

// Chaves de teste públicas da Cloudflare: o widget sempre passa.
// Troque por chaves reais em TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY.
const TURNSTILE_TEST_SITE = '1x00000000000000000000AA';
const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';

const env = (k) => (process.env[k] || '').trim();

function config() {
  return {
    serper: env('SERPER_API_KEY'),
    hibp: env('HIBP_API_KEY'),
    breachProvider: (env('BREACH_PROVIDER') || 'auto').toLowerCase(),
    resend: env('RESEND_API_KEY'),
    resendFrom: env('RESEND_FROM') || 'Sumiço <onboarding@resend.dev>',
    redisUrl: env('KV_REST_API_URL') || env('UPSTASH_REDIS_REST_URL'),
    redisToken: env('KV_REST_API_TOKEN') || env('UPSTASH_REDIS_REST_TOKEN'),
    adminPassword: env('ADMIN_PASSWORD'),
    siteUrl: (env('SITE_URL') || 'https://www.xn--sumio-1ra.com.br').replace(/\/+$/, ''),
    turnstileSite: env('TURNSTILE_SITE_KEY') || TURNSTILE_TEST_SITE,
    turnstileSecret: env('TURNSTILE_SECRET_KEY') || TURNSTILE_TEST_SECRET,
  };
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).end(JSON.stringify(body));
}

function header(req, name) {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : (v || '');
}

function clientIp(req) {
  return header(req, 'x-real-ip') || header(req, 'x-forwarded-for').split(',')[0].trim() || '0.0.0.0';
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function safeEqual(a, b) {
  const x = Buffer.from(sha(a)), y = Buffer.from(sha(b));
  return crypto.timingSafeEqual(x, y);
}

async function fetchJson(url, opts = {}, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
    return { ok: r.ok, status: r.status, data };
  } finally {
    clearTimeout(t);
  }
}

// ---------- Redis (Upstash REST) ----------
async function redis(cfg, commands) {
  if (!cfg.redisUrl || !cfg.redisToken) return null;
  const r = await fetchJson(cfg.redisUrl.replace(/\/+$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.redisToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  }, 5000);
  if (!r.ok || !Array.isArray(r.data)) throw new Error('redis ' + r.status);
  return r.data.map((x) => x.result);
}

// Conta uma ocorrência na janela e devolve true se passou do limite.
async function overLimit(cfg, key, limit, windowSec) {
  try {
    const out = await redis(cfg, [['INCR', key], ['EXPIRE', key, String(windowSec), 'NX']]);
    if (!out) return false;
    return Number(out[0]) > limit;
  } catch {
    return false;
  }
}

// ---------- Turnstile ----------
async function verifyTurnstile(cfg, token, ip) {
  if (!token) return false;
  const body = new URLSearchParams({ secret: cfg.turnstileSecret, response: token, remoteip: ip });
  try {
    const r = await fetchJson('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body }, 6000);
    return !!(r.data && r.data.success);
  } catch {
    return false;
  }
}

const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = { config, send, header, clientIp, sha, safeEqual, fetchJson, redis, overLimit, verifyTurnstile, esc };
