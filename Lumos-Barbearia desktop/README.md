# Lumos Barbearia — app desktop (balcão / barbeiro)

Electron + React + TypeScript. É a tela que fica no computador da barbearia:
agenda do dia, arrastar para remarcar, clientes, cardápio com preço e duração,
e o painel do que entra pelo site.

Ele fala a **mesma língua** do site (`../Lumos-Barbearia`, Flask) — mesmas regras
de horário, mesmo anti-conflito, mesma grade terça a sábado — e quando o Supabase
for liberado os dois passam a ler/escrever no **mesmo banco**, junto com o futuro
app mobile.

## Rodar

```bash
npm install
npm run start        # build + abre a janela do Electron
npm run dev          # desenvolvimento (Vite + Electron com hot reload)
npm run web          # só a interface no navegador (dados de exemplo no localStorage)
```

`npm run web` é para você olhar o visual rápido sem instalar nada; ali os dados
vivem no `localStorage` do navegador e o rodapé avisa “demonstração no navegador”.
No app de verdade (`npm run start`) os dados vão para um JSON no diretório de
dados do usuário.

## Testes (roda tudo aqui, sem GUI)

```bash
npm run test:regras  # 22 casos: datas, dias fechados, conflito, duração, LGPD, moeda
npm run test:dados   # 13 casos (roda os 22 antes): driver Supabase contra um PostgREST falso + arquivo local
npm test             # os dois
```

O `test:dados` stuba o `fetch` e confere, por exemplo:

- `POST /agendamentos` sai com `status: 'pendente'` e observação já limpa;
- erro `23505` (mesmo horário tomado) vira **“acabou de ser reservado em outro
  dispositivo”**, não uma stack;
- RLS bloqueando escrita aparece como erro de acesso legível;
- queda de rede retorna aviso amigável em vez de estourar a tela;
- excluir cliente: busca só `data >= hoje`, apaga os futuros, anonimiza o histórico
  (`cliente_id = null`) e então apaga o cadastro;
- o arquivo local grava, relê, e um JSON corrompido é preservado como `.corrompido`
  em vez de derrubar o app.

## Estrutura

```
src/shared/rules.ts        grade, dias abertos, conflito, moeda  <- mesma lógica do site
src/shared/memoria.ts      operações de negócio sobre o snapshot
src/shared/adaptadores.ts  repositório local (arquivo JSON ou localStorage)
src/electron/main.ts       janela, menu, atalhos, IPC, storage da chave
src/electron/preload.ts    ponte mínima (contextIsolation, sem node no renderer)
src/electron/supabase.ts   repositório via PostgREST (fetch puro, sem SDK)
src/renderer/              interface (sidebar, painel, agenda, clientes, serviços, config)
migrations/supabase.sql    contrato das tabelas compartilhadas
```

## Como ligar no Supabase (quando liberarem o acesso)

1. Rodar `migrations/supabase.sql` no SQL Editor do projeto (cria `clientes`,
   `usuarios_web`, `servicos`, `agendamentos` com `unique (data, horario)`,
   `config_loja` e as políticas de RLS).
2. No app: **Configurações → Supabase**, colar a URL do projeto e a chave de
   servidor, e clicar em *testar conexão*. `aplicar` grava a chave cifrada
   (`safeStorage`, quando o SO permite) e troca a fonte de dados na hora.
3. Para voltar: mesma tela, escolher *arquivo no computador*.

O app funciona 100% sem Supabase: enquanto a conexão não estiver ligada ele grava
no arquivo JSON local — nada de tela quebrada esperando credencial.

## O que já vem fechado (herdado das correções do site)

- **Um horário, uma reserva**: a trava é do banco (`unique (data,horario)`), e a
  tela desabilita o que já foi tomado. Serviço de 60/120 min ocupa 2/3 blocos e o
  app confere os blocos seguintes.
- Data validada no servidor do app (nada de `<input>` como única defesa): passada,
  segunda, domingo e além de 60 dias não entram.
- Cliente vê só o próprio cadastro; exclusão segue o art. 18 da LGPD e libera os
  horários futuros.
- IPC nomeado, `contextIsolation` ligado, `nodeIntegration` desligado, sandbox
  ligado, links externos abrem fora da janela.
- Preço mora em centavos; duração em minutos; nada de vírgula × ponto solto.

## Empacotar instalador

`npm run dist` (electron-builder já configurado no `package.json`: portable `.exe`
no Windows, AppImage no Linux, `.dmg` no macOS; saída em `release/`). Precisa
estar instalado como devDep quando você for gerar:

```bash
npm i -D electron-builder
npm run dist            # na plataforma em que você está
npm run dist -- --win   # cross-compile para Windows pede wine/doc no Linux
```

## Limitações sabidas (decisão, não esquecimento)

- O desktop hoje grava local; o Supabase entra como fonte única quando a chave
  chegar — até lá, site e desktop **não** compartilham a mesma agenda.
- Sem multi-barbeiro: a agenda é da loja inteira, como no site.
- Aviso de WhatsApp/lembrete automático ainda não existe (nem no site).
- Sincronização offline → fila de espera: se a rede cair em modo Supabase, a
  operação falha com aviso claro; não há fila de reenvio automático.
