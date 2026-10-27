"""Camada de acesso ao banco (SQLite).

Escritas de agolvimento acontecem dentro de transacao IMEDIATA e existe um
índice UNIQUE em (data, horário): o próprio banco impede dois clientes no
mesmo horário, mesmo com dois cliques simultaneos.
"""
import os
import sqlite3

from .security import gerar_hash

DDL_USUARIOS = """
CREATE TABLE IF NOT EXISTS usuarios (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    nome                TEXT NOT NULL,
    email               TEXT NOT NULL UNIQUE,
    telefone            TEXT NOT NULL,
    senha_hash          TEXT NOT NULL,
    is_admin            INTEGER NOT NULL DEFAULT 0,
    aceite_lgpd_versao  TEXT,
    data_aceite_lgpd    TEXT
)
"""

DDL_SERVICOS = """
CREATE TABLE IF NOT EXISTS servicos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nome           TEXT NOT NULL UNIQUE,
    descricao      TEXT NOT NULL DEFAULT '',
    preco_centavos INTEGER NOT NULL DEFAULT 0,
    duracao_min    INTEGER NOT NULL DEFAULT 40,
    ativo          INTEGER NOT NULL DEFAULT 1,
    ordem          INTEGER NOT NULL DEFAULT 0
)
"""

DDL_AGENDAMENTOS = """
CREATE TABLE IF NOT EXISTS agendamentos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    servico_id  INTEGER NOT NULL REFERENCES servicos (id),
    data        TEXT NOT NULL,
    horario     TEXT NOT NULL,
    confirmado  INTEGER NOT NULL DEFAULT 0,
    criado_em   TEXT NOT NULL,
    UNIQUE (data, horario)
)
"""

INDICES = [
    "CREATE INDEX IF NOT EXISTS ix_agenda_usuario ON agendamentos (usuario_id)",
    "CREATE INDEX IF NOT EXISTS ix_agenda_data ON agendamentos (data)",
]

SERVICOS_PADRAO = [
    ("Corte Moderno", "Estilo atualizado, adaptado ao seu perfil.", 4500, 40),
    ("Barba Completa", "Modelagem com toalha quente e produtos especiais.", 3500, 40),
    ("Combo Completo (Corte + Barba)", "Corte + barba com atendimento VIP.", 7000, 60),
]

_MAPA_SERVICO_LEGADO = {
    "Barba Completa": "Barba Completa",
    "Combo Completo (Corte + Barba)": "Combo Completo (Corte + Barba)",
}


def abrir(caminho):
    d = os.path.dirname(os.path.abspath(caminho))
    os.makedirs(d, exist_ok=True)
    conn = sqlite3.connect(os.path.abspath(caminho), timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 15000")
    return conn


def inicializar(caminho):
    conn = abrir(caminho)
    try:
        conn.executescript(
            "BEGIN;\n" + DDL_USUARIOS + ";\n" + DDL_SERVICOS + ";\n" + DDL_AGENDAMENTOS
        )
        for i in INDICES:
            conn.execute(i)
        conn.execute("COMMIT")
        _migrar_usuarios_legado(conn)
        _semear_servicos(conn)          # antes de migrar a agenda: ela referencia serviços
        _migrar_agendamentos_legado(conn)
        remover_admin_padrao_legado(conn)
    finally:
        conn.close()


def _tabelas(conn):
    return {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def _colunas(conn, tabela):
    return {r[1] for r in conn.execute(f"PRAGMA table_info({tabela})")}


def _recriar(conn, ddl):
    """Cria a tabela nova apos um RENAME, sem transacao aberta por cima."""
    conn.executescript("BEGIN;\n" + ddl + ";\nCOMMIT;")


def _migrar_usuarios_legado(conn):
    """Versao antiga guardava senha em texto puro na coluna `senha`."""
    if "usuarios_legado" in _tabelas(conn):
        return
    if "usuarios" not in _tabelas(conn) or "senha" not in _colunas(conn, "usuarios"):
        return

    antigos = conn.execute("SELECT * FROM usuarios").fetchall()
    conn.execute("ALTER TABLE usuarios RENAME TO usuarios_legado")
    _recriar(conn, DDL_USUARIOS)
    for r in antigos:
        conn.execute(
            "INSERT INTO usuarios (id, nome, email, telefone, senha_hash, is_admin,"
            " aceite_lgpd_versao, data_aceite_lgpd) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                r["id"],
                r["nome"],
                r["email"],
                r["telefone"] or "",
                gerar_hash(r["senha"] or ""),
                r["is_admin"] or 0,
                "2024.1" if r["aceito_lgpd"] else None,
                r["data_aceite_lgpd"],
            ),
        )
    _neutralizar_senhas_legadas(conn)


def _neutralizar_senhas_legadas(conn):
    """A tabela de backup usuarios_legado ainda tem senha em texto puro.
    Mantemos o backup para rollback, mas sem as senhas."""
    if "usuarios_legado" in _tabelas(conn) and "senha" in _colunas(conn, "usuarios_legado"):
        conn.execute("UPDATE usuarios_legado SET senha = 'REMOVIDO-PELA-MIGRACAO'")


def _id_do_servico(conn, texto):
    nome = _MAPA_SERVICO_LEGADO.get((texto or "").strip(), "Corte Moderno")
    row = conn.execute("SELECT id FROM servicos WHERE nome = ?", (nome,)).fetchone()
    return row["id"]


def _migrar_agendamentos_legado(conn):
    """Versão antiga tinha serviço em TEXT e copiava nome/telefone do usuário."""
    if "agendamentos_legado" in _tabelas(conn):
        return
    if "agendamentos" not in _tabelas(conn):
        return
    if "servico" not in _colunas(conn, "agendamentos"):
        return  # já está no formato novo

    antigos = conn.execute("SELECT * FROM agendamentos ORDER BY id").fetchall()
    conn.execute("ALTER TABLE agendamentos RENAME TO agendamentos_legado")
    _recriar(conn, DDL_AGENDAMENTOS)
    usuario_valido = {r["id"] for r in conn.execute("SELECT id FROM usuarios")}
    for a in antigos:
        if a["usuario_id"] not in usuario_valido:
            continue
        try:
            conn.execute(
                "INSERT INTO agendamentos (id, usuario_id, servico_id, data, horario,"
                " confirmado, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    a["id"],
                    a["usuario_id"],
                    _id_do_servico(conn, a["servico"]),
                    a["data"],
                    a["horario"],
                    a["confirmado"] or 0,
                    "migrado-do-schema-antigo",
                ),
            )
        except sqlite3.IntegrityError:
            continue  # conflito de horario que ja existia no dado legado


def remover_admin_padrao_legado(conn):
    """A versao antiga criava a conta 'admin' com senha 'admin': porta de entrada
    para qualquer um. Ela some na migracao; o admin passa a existir so via
    ADMIN_EMAIL + ADMIN_PASSWORD no ambiente.
    """
    row = conn.execute("SELECT id FROM usuarios WHERE lower(email) = 'admin'").fetchone()
    if not row:
        return False
    conn.execute("BEGIN IMMEDIATE")
    conn.execute("DELETE FROM agendamentos WHERE usuario_id = ?", (row["id"],))
    conn.execute("DELETE FROM usuarios WHERE id = ?", (row["id"],))
    conn.execute("COMMIT")
    return True


def _semear_servicos(conn):
    if conn.execute("SELECT 1 FROM servicos LIMIT 1").fetchone():
        return
    for i, (nome, desc, preco, dur) in enumerate(SERVICOS_PADRAO):
        conn.execute(
            "INSERT INTO servicos (nome, descricao, preco_centavos, duracao_min, ativo, ordem)"
            " VALUES (?, ?, ?, ?, 1, ?)",
            (nome, desc, preco, dur, i),
        )


def servicos_ativos(conn):
    return conn.execute("SELECT * FROM servicos WHERE ativo = 1 ORDER BY ordem, nome").fetchall()
