# Lumos Barbearia — agenda online

Flask + SQLite. Serviços, horários, contas de cliente e painel do barbeiro.

```
app.py                rotas + configuração (única porta de entrada)
lumos/db.py           schema, migrações e conexão SQLite
lumos/agenda.py       regras: horários, validação, escrita anti-conflito
lumos/security.py     hash de senha, CSRF, limite de tentativas de login
templates/base.html   layout único herdado por todas as páginas
static/css/style.css  única folha de estilo
tests/test_fluxos.py  27 testes que provam as correções
scripts/verificar_projeto.py  62 checagens de consistência (template/CSS/rotas/texto)
```

## Rodar no computador

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # edite o .env antes de subir de verdade
flask run
```

Abra `http://127.0.0.1:5000`. O banco é criado sozinho em `data/barbearia.db`.

## Configuração (.env)

| Variável | Para que serve |
|---|---|
| `SECRET_KEY` | Assina o cookie de sessão. **Obrigatório em produção** — sem ela o app se recusa a subir. Gere com `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `FLASK_ENV` | `production` liga cookie `Secure` e a recusa de rodar sem `SECRET_KEY` |
| `FLASK_DEBUG` | `1` liga o reloader. **Nunca** em produção |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD` | Única forma de criar o barbeiro/admin. Não existe mais senha padrão |
| `DATABASE_PATH` | Onde o SQLite fica. Em deploy, aponte para disco persistente |
| `BIZ_ENDERECO`, `BIZ_WHATSAPP`, `BIZ_INSTAGRAM`, `BIZ_EMAIL`, `BIZ_RESPONSAVEL` | Contatos exibidos no rodapé e na política de privacidade |

## Migrando os dados da versão antiga

Rode uma vez apontando para o banco velho copiado para `data/barbearia.db`:

```bash
DATABASE_PATH=data/barbearia.db flask run
```

O `inicializar()` detecta o schema antigo e, sem perder nada:

- transforma a coluna `senha` (texto puro) em `senha_hash` (pbkdf2-sha256) — as senhas atuais continuam valendo;
- apaga a conta `admin` com senha `admin` e limpa as senhas em texto puro da tabela de backup `usuarios_legado`;
- troca a coluna `servico TEXT` por `servico_id` ligada na tabela `servicos` (com preço e duração);
- cria o índice UNIQUE em `(data, horario)`.

Rode os testes antes de subir: `python -m unittest discover -s tests -v`.

## Horários de funcionamento

Terça a sábado, das 09h às 18h, em slots de 40 minutos. A regra fica em
`lumos/agenda.py` (`SLOTS`, `DIAS_ABERTOS`, `HORIZONTE_MAX_DIAS`) e é validada
**no servidor** — data passada, segunda/domingo e horário já passado não passam,
mesmo se alguém alterar o HTML.

Preços e nomes de serviço agora moram na tabela `servicos`:

```sql
UPDATE servicos SET nome='Corte + Barba', preco_centavos=7500, duracao_min=60 WHERE id=3;
```

## Segurança: o que já está fechado

- senha com hash + salt, nunca em texto puro;
- `SECRET_KEY` e credenciais só pelo ambiente; sem `admin/admin`;
- CSRF em **todo** POST (incluindo sair e cancelar), com token por sessão;
- cancelar/conferir presença são `POST` — não dá mais para apagar reserva por link;
- cliente vê só os próprios agendamentos; `/admin` exige sessão de admin (403);
- login com bloqueio após 10 tentativas em 15 min, por IP + e-mail;
- sessão recriada no login (anti-fixação), cookie `HttpOnly` + `SameSite=Lax`
  (+ `Secure` em produção);
- validação única no servidor; SQLite com `foreign_keys`, `WAL` e `busy_timeout`;
- páginas de erro 403/404/405/500 sem vazar stack trace.

## LGPD (art. 18)

- consentimento obrigatório no cadastro, com versão e data gravadas;
  pedir de novo quando `VERSAO_LGPD` mudar;
- `/privacidade`: controlador, dados coletados, finalidade, base legal, retenção;
- `/conta/exportar`: baixar os próprios dados em JSON (portabilidade);
- `/conta/excluir`: apagar conta, liberando os horários futuros;
- o banco em `data/` está no `.gitignore` — não commite dados de clientes.

## Deploy (importante)

Em Heroku/Render/Koyeb o disco é **efêmero**: sem volume, o SQLite é perdido a
cada push ou restart.

- Render: crie um *Disk* e aponte `DATABASE_PATH` para ele (ex. `/var/data/barbearia.db`).
- Ou troque para Postgres (Supabase/Neon) — nesse caso os helpers de `lumos/db.py`
  são a única camada a mexer.

## Testes

```bash
python -m unittest discover -s tests -v      # regras de negócio
python scripts/verificar_projeto.py          # 62 checagens de consistência
```

## O que ficou de fora (decisão consciente)

- Postgres, pagamentos, lembrete por WhatsApp e múltiplos barbeiros não entraram;
  o modelo ainda é de uma loja/uma agenda só.
- Durações maiores que o slot (ex. Combo de 60 min) ainda não bloqueiam o próximo
  horário — a grade é fixa de 40 em 40 min.
- A imagem do topo vem da Unsplash por URL; para produção, baixe-a e sirva de `/static/img/`.
