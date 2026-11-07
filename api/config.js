// GET /api/config — chave pública do Turnstile e quais partes da varredura estão ativas.
// Não expõe nenhum segredo, só se cada integração está configurada.

const { config, send } = require('./_lib');

module.exports = (req, res) => {
  const cfg = config();
  send(res, 200, {
    turnstileSiteKey: cfg.turnstileSite,
    turnstileTest: cfg.turnstileSite.startsWith('1x0000'),
    features: {
      search: !!cfg.serper,
      breaches: !!cfg.hibp,
      email: !!cfg.resend,
      db: !!(cfg.redisUrl && cfg.redisToken),
      admin: !!cfg.adminPassword,
    },
  });
};
