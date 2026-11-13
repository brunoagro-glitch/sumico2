# Sumiço 👻 — Seus dados, fora da internet (MVP)

> **Quem dá o limite é você.**
> Veja onde seu nome aparece na internet e se seu e-mail vazou. Grátis, em minutos, direto no seu e-mail.

Este repositório contém a **primeira etapa do Sumiço**: uma landing page com uma **varredura gratuita**
que faz uma pré-varredura pública sobre o nome e o e-mail da pessoa e envia o resultado por e-mail.
A remoção pela LGPD é o produto pago.

**Meta:** faturar R$50 mil de MRR (receita recorrente mensal) até dezembro de 2027.

## Como funciona
1. A pessoa informa nome completo, e-mail e cidade, e autoriza a busca.
2. O formulário passa pelo Cloudflare Turnstile e por limites por IP e por e-mail.
3. O backend busca o nome na web e consulta se o e-mail aparece em vazamentos.
4. O link do relatório completo **só vai no e-mail de quem pediu** (token aleatório), nunca aparece na tela.
   Assim só o dono do e-mail vê o resultado, e a varredura não serve para bisbilhotar terceiros.

## Técnico

Site estático (`index.html`) com funções da Vercel em `api/`.

## O que tem aqui
- `index.html` — landing. Os botões "Quero sumir" abrem o pop-up da varredura grátis.
- `admin.html` — painel em `/admin` com as varreduras e os leads (senha em `ADMIN_PASSWORD`).
- `api/geo.js` — cidade aproximada do visitante, pelos cabeçalhos da própria Vercel.
- `api/scan.js` — varredura: busca o nome (Serper), consulta vazamentos do e-mail
  (HIBP com chave; sem ela, XposedOrNot grátis),
  envia o relatório (Resend) e guarda o lead (Upstash Redis).
- `api/config.js` — chave pública do Turnstile e quais integrações estão ativas.
- `api/admin.js` — dados do painel.
- `api/report.js` — devolve o relatório completo pelo token enviado no e-mail (guardado por 30 dias).
- `api/waitlist.js` — lista de espera dos planos pagos.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)
| Variável | Para quê |
|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Criadas sozinhas ao conectar o Upstash em Storage |
| `ADMIN_PASSWORD` | Senha do `/admin` |
| `SERPER_API_KEY` | Busca do nome no Google |
| `RESEND_API_KEY` | Envio do relatório por e-mail |
| `HIBP_API_KEY` | Opcional. Com ela os vazamentos vêm do HIBP; sem ela, do XposedOrNot (grátis, sem chave) |
| `BREACH_PROVIDER` | Opcional: `auto` (padrão), `xon`, `hibp` ou `off` |
| `SITE_URL` | Link usado nos e-mails |
| `RESEND_FROM` | Opcional. Remetente após verificar um domínio no Resend |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Opcional. Sem elas usa as chaves de teste da Cloudflare |

Cada integração que faltar é desligada sem quebrar o site. Depois de mudar variáveis,
faça um novo deploy (Deployments → ⋯ → Redeploy) para elas valerem.

Enquanto o domínio não for verificado no Resend, os e-mails só chegam no endereço
da conta do Resend.

## Limites
10 varreduras por IP por hora e 3 por e-mail por dia (exige o Upstash conectado).

## Vazamentos
- `auto`: HIBP quando há `HIBP_API_KEY`, senão XposedOrNot (`/v1/breach-analytics`).
- XposedOrNot grátis: 2 consultas/s, 25/hora e 100/dia por IP (os IPs da Vercel são
  compartilhados). Ao receber 429 o relatório sai com "vazamentos indisponíveis agora"
  e o site para de consultar por 10 minutos.
- Cada resultado fica no Upstash por 30 dias (chave com hash do e-mail, sem o e-mail em claro).

## Fornecedores que recebem dados do visitante (LGPD)
Para a política de privacidade: Vercel (hospedagem), Upstash (banco), Serper (nome e cidade),
Resend (e-mail e relatório), Cloudflare Turnstile (verificação anti-robô) e
XposedOrNot ou Have I Been Pwned (e-mail, para checar vazamentos).

## Princípios de privacidade
- **Minimização:** a varredura grátis não pede CPF nem telefone. Esses dados só entram depois da contratação, com verificação de identidade.
- **Entrega restrita:** o relatório só chega ao e-mail informado.
- **Transparência:** a política de privacidade lista os fornecedores acima, o que cada um recebe e por quanto tempo os dados ficam guardados.
- **Atribuição:** quando os vazamentos vêm do Have I Been Pwned, o relatório dá o crédito ao serviço.
- **Direitos do titular:** canal de privacidade para acesso, correção e exclusão (LGPD, art. 18).

## Limitações conhecidas
- **Homônimos:** nomes comuns geram contagens infladas; o relatório fala em "possíveis menções".
- **Cobertura:** a busca web não alcança páginas não indexadas nem sites que bloqueiam buscadores.
- **Remoção** não é feita nesta etapa; a varredura grátis é diagnóstico.

## Roadmap
- [x] Landing + varredura grátis por e-mail
- [x] Lista de espera dos planos
- [ ] Checkout (Pix e cartão) para a limpeza paga
- [ ] Procuração digital e verificação de identidade
- [ ] Motor de pedidos de remoção (LGPD, art. 18)
- [ ] Painel do cliente ("31 de 47 removidos")
- [ ] Varredura mensal recorrente
- [ ] Plano Família

## Licença
Proprietário. Todos os direitos reservados © Sumiço.
