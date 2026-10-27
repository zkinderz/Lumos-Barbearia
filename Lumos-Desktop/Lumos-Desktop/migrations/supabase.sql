-- ============================================================================
--  LUMOS BARBEARIA — banco compartilhado (desktop + site + futuro mobile)
--  Rodar no SQL Editor do Supabase assim que o acesso for liberado.
--  Este arquivo é o CONTRATO: o app desktop (src/electron/supabase.ts) e o site
--  passam a ler/escrever exatamente nestas tabelas.
-- ============================================================================

create extension if not exists pgcrypto;

-- ───────────────────────────────────────────────────────────── clientes ──
-- Contato do cliente. Serve ao balcão (desktop) e ao site. Login fica em outra
-- tabela para não vazar hash de senha em quem só queria um telefone.
create table if not exists public.clientes (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null check (char_length(trim(nome)) >= 2),
  telefone           text not null unique,          -- somente dígitos, com DDD
  email              text unique,
  obs                text,
  aceite_lgpd_versao text,                          -- ex.: '2026.1' ou 'balcao'
  origem             text not null default 'desktop'
                     check (origem in ('desktop','web','importado')),
  criado_em          timestamptz not null default now(),
  eliminado_em       timestamptz                     -- LGPD art. 18, IV (soft)
);

-- ──────────────────────────────────────────────────────── usuarios (web) ──
-- Autenticação do site. O desktop não usa esta tabela.
create table if not exists public.usuarios_web (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid references public.clientes(id) on delete set null,
  email         text not null unique,
  senha_hash    text not null,                       -- pbkdf2/argon2, nunca texto puro
  is_admin      boolean not null default false,
  aceite_lgpd_versao text,
  data_aceite   timestamptz,
  criado_em     timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────── servicos ──
create table if not exists public.servicos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null unique,
  descricao      text not null default '',
  preco_centavos integer not null default 0 check (preco_centavos >= 0),
  duracao_min    integer not null default 40 check (duracao_min between 10 and 240),
  ativo          boolean not null default true,
  ordem          integer not null default 0
);

-- ────────────────────────────────────────────────────────── agendamentos ─
-- unique(data, horario): a trava anti-conflito mora aqui, não na tela.
-- Vale para desktop, site e qualquer app futuro, mesmo simultâneos.
create table if not exists public.agendamentos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id),
  servico_id  uuid not null references public.servicos(id),
  data        date not null,
  horario     time not null,
  status      text not null default 'pendente'
              check (status in ('pendente','confirmado','concluido','faltou')),
  origem      text not null default 'desktop' check (origem in ('desktop','web')),
  obs         text,
  usuario_id  uuid references public.usuarios_web(id) on delete set null,  -- quem criou pelo site
  criado_em   timestamptz not null default now(),
  unique (data, horario)
);

create index if not exists ix_agenda_data    on public.agendamentos (data);
create index if not exists ix_agenda_cliente on public.agendamentos (cliente_id);
create index if not exists ix_agenda_status  on public.agendamentos (status);

-- ─────────────────────────────────────────────────────────── config_loja ──
create table if not exists public.config_loja (
  chave text primary key,
  valor jsonb not null
);
insert into public.config_loja (chave, valor) values
  ('nome',         '"Lumos Barbearia"'),
  ('endereco',     '""'),
  ('whatsapp',     '""'),
  ('email',        '""'),
  ('comissao_pct', '35'),
  ('funcionamento','"Terça a sábado, das 09h às 18h"'),
  ('versao_lgpd',  '"2026.1"')
on conflict (chave) do nothing;

-- ───────────────────────────────────────────────────────────────── seeds ──
insert into public.servicos (nome, descricao, preco_centavos, duracao_min, ordem) values
  ('Corte Moderno',  'Estilo atualizado, adaptado ao seu perfil.', 4500, 40, 0),
  ('Barba Completa', 'Modelagem com toalha quente e navalha.',     3500, 40, 1),
  ('Combo Corte + Barba', 'Atendimento completo, com café.',       7000, 60, 2),
  ('Pezinho / Acabamento', 'Só o contorno.',                       1500, 20, 3)
on conflict (nome) do nothing;

-- ──────────────────────────────────────────────────────────── RLS ─────────
-- O app desktop usa chave de servidor e bypissa RLS. Estas políticas valem para
-- qualquer acesso anônimo (navegador): só o cardápio é público.
alter table public.clientes      enable row level security;
alter table public.servicos      enable row level security;
alter table public.agendamentos  enable row level security;
alter table public.config_loja   enable row level security;
alter table public.usuarios_web  enable row level security;

drop policy if exists servicos_publicos on public.servicos;
create policy servicos_publicos on public.servicos for select using (true);

-- nada de leitura anônima de contatos, agenda, login ou config
drop policy if exists tudo_privado_clientes on public.clientes;
create policy tudo_privado_clientes on public.clientes for select using (false);
drop policy if exists tudo_privado_agenda on public.agendamentos;
create policy tudo_privado_agenda on public.agendamentos for select using (false);
drop policy if exists tudo_privado_usuarios on public.usuarios_web;
create policy tudo_privado_usuarios on public.usuarios_web for all using (false);
drop policy if exists tudo_privado_config on public.config_loja;
create policy tudo_privado_config on public.config_loja for select using (false);

-- ============================================================================
--  IMPORTAÇÃO DO BANCO LEGADO DO SITE (SQLite barbearia.db)
--  Rode depois, colando os JSONs exportados do SQLite (schema antigo:
--  usuarios(id,nome,email,telefone,senha,is_admin,aceito_lgpd,data_aceite_lgpd)
--  agendamentos(id,usuario_id,servico TEXT,data TEXT,horario TEXT,confirmado INT)).
--  Antes disso o app desktop já funciona com estes campos; só falta popular.
--
--  with novos_clientes as (
--    insert into public.clientes (nome, telefone, email, aceite_lgpd_versao, origem, criado_em)
--    select nome, regexp_replace(telefone,'\D','','g'), lower(email),
--           case when aceito_lgpd = 1 then '2024.1' else null end, 'importado', data_aceite_lgpd::timestamptz
--    from_JSON(:'clientes') as t(id text, nome text, email text, telefone text,
--                                aceito_lgpd int, data_aceite_lgpd text)
--    on conflict (telefone) do nothing
--    returning id, email
--  )
--  insert into public.usuarios_web (cliente_id, email, senha_hash, is_admin, aceite_lgpd_versao, data_aceite)
--  select c.id, lower(u.email), 'PENSA-IMPORTAR: redefinir senha', (u.is_admin = 1), '2024.1',
--         nullif(u.data_aceite_lgpd,'')::timestamptz
--  from_JSON(:'usuarios') as t(id text, email text, is_admin int, data_aceite_lgpd text) u
--  join public.clientes c on c.email = lower(u.email)
--  on conflict (email) do nothing;
--
--  A senha do banco legado estava em texto puro: NÃO importa. O import cria o
--  cadastro e o cliente redefine a senha no primeiro acesso (ou você define uma
--  chave temporária e avisa por WhatsApp).
-- ============================================================================
