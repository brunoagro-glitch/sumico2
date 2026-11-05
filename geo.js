// Função da Vercel: devolve a localização aproximada de quem está acessando,
// usando os cabeçalhos de geolocalização que a própria Vercel adiciona a cada requisição.
// Nenhum serviço externo é chamado e nada é registrado.
// Docs: https://vercel.com/docs/headers/request-headers

const UF = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
};

function header(req, name) {
  const v = req.headers[name];
  if (!v) return '';
  try { return decodeURIComponent(Array.isArray(v) ? v[0] : v); } catch { return String(v); }
}

module.exports = (req, res) => {
  const country = header(req, 'x-vercel-ip-country');
  const regionCode = header(req, 'x-vercel-ip-country-region');
  const city = header(req, 'x-vercel-ip-city');
  const ip = header(req, 'x-real-ip') || header(req, 'x-forwarded-for').split(',')[0].trim();

  const region = country === 'BR' ? (UF[regionCode] || regionCode) : regionCode;

  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).end(JSON.stringify({ ip, city, region, country }));
};
