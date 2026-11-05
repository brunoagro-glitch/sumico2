# Sumiço — landing page

Site estático (index.html + assets/) com uma função da Vercel em `api/geo.js`
que mostra ao visitante a cidade aproximada do IP dele, sem serviços de terceiros.

## Publicar na Vercel
1. Suba esta pasta para um repositório no GitHub.
2. Em vercel.com → Add New → Project → importe o repositório.
3. Framework Preset: **Other**. Não precisa de build command nem de output directory.
4. Deploy.

A aba de localização só funciona no endereço publicado na Vercel. Abrindo o
index.html direto no computador, ela mostra a mensagem genérica.
