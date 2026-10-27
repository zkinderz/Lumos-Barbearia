# Notas de licença / dependências

- Runtime: Electron (Chromium + Node.js) e React — ambos MIT.
- Sem SDK do Supabase: a integração usa só `fetch` contra o PostgREST, então não
  há dependência nativa para empacotar.
- Fonte de texto via Google Fonts (Inter + Playfair Display); em máquina offline
  o app cai para a pilha de fontes do sistema, sem quebrar o layout.
