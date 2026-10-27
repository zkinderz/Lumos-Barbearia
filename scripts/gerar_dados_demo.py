"""Cria dados de demonstracao para voce clicar pelo site sem cadastrar na mao.

  python scripts/gerar_dados_demo.py

Nao faz parte do funcionamento do sistema e nao contem dados reais de cliente:
usa duas contas fictícias de teste com senha conhecida (senha-forte-123) e algumas
reservas nos proximos dias abertos. Para zerar depois, apague a pasta data/.
"""
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("SECRET_KEY", "demo-local")

from app import CAMINHO_BD  # noqa: E402
from lumos import db, security  # noqa: E402
from lumos.agenda import DIAS_ABERTOS, SLOTS  # noqa: E402

CLIENTES = [
    ("Cliente Exemplo 1", "cliente1@lumos.test", "11977776666"),
    ("Cliente Exemplo 2", "cliente2@lumos.test", "11966665555"),
]
SENHA_DEMO = "senha-forte-123"


def proximo_aberto(dias):
    d = date.today() + timedelta(days=dias)
    while d.weekday() not in DIAS_ABERTOS:
        d += timedelta(days=1)
    return d.isoformat()


def main():
    conn = db.abrir(CAMINHO_BD)
    hash_demo = security.gerar_hash(SENHA_DEMO)
    ids = []
    for nome, email, tel in CLIENTES:
        row = conn.execute("SELECT id FROM usuarios WHERE lower(email) = ?", (email.lower(),)).fetchone()
        if row:
            ids.append(row["id"])
            continue
        conn.execute(
            "INSERT INTO usuarios (nome, email, telefone, senha_hash, is_admin,"
            " aceite_lgpd_versao, data_aceite_lgpd) VALUES (?, ?, ?, ?, 0, 'demo', datetime('now'))",
            (nome, email.lower(), tel, hash_demo),
        )
        ids.append(conn.execute("SELECT id FROM usuarios WHERE lower(email) = ?",
                                (email.lower(),)).fetchone()["id"])
    print(f"clientes de teste: {[c[1] for c in CLIENTES]} (senha: {SENHA_DEMO})")

    slots = [(proximo_aberto(1), "10:20"), (proximo_aberto(1), "14:20"), (proximo_aberto(3), "09:40")]
    criados = 0
    for i, (d, h) in enumerate(slots):
        try:
            conn.execute(
                "INSERT INTO agendamentos (usuario_id, servico_id, data, horario, confirmado, criado_em)"
                " VALUES (?, ?, ?, ?, ?, datetime('now'))",
                (ids[i % len(ids)], (i % 3) + 1, d, h, 1 if i == 0 else 0),
            )
            criados += 1
        except Exception as erro:  # reserva que ja existia
            print("  pulado:", erro)
    print(f"{criados} agendamentos de exemplo criados nas datas {sorted({d for d, _ in slots})}")
    print("Admin: use ADMIN_EMAIL/ADMIN_PASSWORD do seu .env para ver o painel.")
    conn.close()


if __name__ == "__main__":
    main()
