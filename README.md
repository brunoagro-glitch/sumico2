# Sumiço — landing page e varredura grátis

Site estático (`index.html`) com funções da Vercel em `api/`.

## O que tem aqui
- `index.html` — landing. Os botões "Quero sumir" abrem o pop-up da varredura grátis.
- `admin.html` — painel em `/admin` com as varreduras e os leads (senha em `ADMIN_PASSWORD`).
- `api/geo.js` — cidade aproximada do visitante, pelos cabeçalhos da própria Vercel.
- `api/scan.js` — varredura: busca o nome (Serper), consulta vazamentos do e-mail (HIBP),
  envia o relatório (Resend) e guarda o lead (Upstash Redis).
- `api/config.js` — chave pública do Turnstile e quais integrações estão ativas.
- `api/admin.js` — dados do painel.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)
| Variável | Para quê |
|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Criadas sozinhas ao conectar o Upstash em Storage |
| `ADMIN_PASSWORD` | Senha do `/admin` |
| `SERPER_API_KEY` | Busca do nome no Google |
| `RESEND_API_KEY` | Envio do relatório por e-mail |
| `HIBP_API_KEY` | Vazamentos (opcional; sem ela o relatório sai só com o nome) |
| `SITE_URL` | Link usado nos e-mails |
| `RESEND_FROM` | Opcional. Remetente após verificar um domínio no Resend |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Opcional. Sem elas usa as chaves de teste da Cloudflare |

Cada integração que faltar é desligada sem quebrar o site. Depois de mudar variáveis,
faça um novo deploy (Deployments → ⋯ → Redeploy) para elas valerem.

Enquanto o domínio não for verificado no Resend, os e-mails só chegam no endereço
da conta do Resend.

## Limites
5 varreduras por IP por hora e 3 por e-mail por dia (exige o Upstash conectado).
