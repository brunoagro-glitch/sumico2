// GET /api/config — chave pública do Turnstile e quais partes da varredura estão ativas.
// Não expõe nenhum segredo, só se cada integração está configurada.

const { config, send } = require('./_lib');
const { breachProvider, PROVIDERS } = require('./_scan');

module.exports = (req, res) => {
  const cfg = config();
  const provider = breachProvider(cfg);
  send(res, 200, {
    breachProvider: provider || null,
    breachSource: provider ? PROVIDERS[provider] : null,
    turnstileSiteKey: cfg.turnstileSite,
    turnstileTest: cfg.turnstileSite.startsWith('1x0000'),
    features: {
      search: !!cfg.serper,
      breaches: !!provider,
      email: !!cfg.resend,
      db: !!(cfg.redisUrl && cfg.redisToken),
      admin: !!cfg.adminPassword,
    },
  });
};
