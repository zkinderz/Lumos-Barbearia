"""Regras de agendamento: agenda da loja, validacao e escrita anti-conflito."""
import sqlite3
from datetime import date, datetime, timedelta

SLOTS = [
    "09:00", "09:40", "10:20", "11:00", "11:40",
    "12:20", "13:00", "13:40", "14:20", "15:00",
    "15:40", "16:20", "17:00", "17:40",
]

# Terca (1) a Sabado (5); segunda e domingo a loja fecha.
DIAS_ABERTOS = {1, 2, 3, 4, 5}
DIAS_DA_SEMANA = {
    0: "segunda", 1: "terca", 2: "quarta", 3: "quinta",
    4: "sexta", 5: "sabado", 6: "domingo",
}
HORIZONTE_MAX_DIAS = 60


def hoje():
    return date.today()


def interpretar_data(texto):
    return date.fromisoformat(texto)


def validar_data(texto):
    """Retorna (date, erro). Regra de negócio no servidor, não só no frontend."""
    if not texto:
        return None, "Escolha uma data."
    try:
        d = interpretar_data(texto)
    except ValueError:
        return None, "Data inválida."
    if d < hoje():
        return None, "Não é possível agendar para datas passadas."
    if d > hoje() + timedelta(days=HORIZONTE_MAX_DIAS):
        return None, f"Agendamentos sao aceitos ate {HORIZONTE_MAX_DIAS} dias à frente."
    if d.weekday() not in DIAS_ABERTOS:
        return None, (
            f"{DIAS_DA_SEMANA[d.weekday()].capitalize()} a barbearia está fechada."
            " Funcionamos de terça a sábado."
        )
    return d, None


def validar_horario(texto, data):
    if not texto:
        return None, "Escolha um horário."
    if texto not in SLOTS:
        return None, "Horário fora da nossa agenda."
    if data == hoje() and texto <= datetime.now().strftime("%H:%M"):
        return None, "Esse horário já passou. Escolha um próximo."
    return texto, None


def validar_servico(conn, texto):
    if not texto or not texto.isdigit():
        return None, "Escolha um serviço."
    row = conn.execute(
        "SELECT * FROM servicos WHERE id = ? AND ativo = 1", (int(texto),)
    ).fetchone()
    if not row:
        return None, "Serviço inválido."
    return row, None


def normalizar_telefone(texto):
    digitos = "".join(c for c in (texto or "") if c.isdigit())
    return digitos or None


def validar_telefone(texto):
    digitos = normalizar_telefone(texto)
    if not digitos or not 10 <= len(digitos) <= 13:
        return None, "Informe um telefone válido com DDD (10 a 13 digitos)."
    return digitos, None


def horarios_livres(conn, data_texto):
    """Slots ainda livres na data (exclui horários já passados quando é hoje)."""
    ocupados = {
        r["horario"]
        for r in conn.execute("SELECT horario FROM agendamentos WHERE data = ?", (data_texto,))
    }
    agora = datetime.now().strftime("%H:%M")
    eh_hoje = data_texto == hoje().isoformat()
    return [h for h in SLOTS if h not in ocupados and not (eh_hoje and h <= agora)]


def criar_agendamento(conn, usuario, servico_id, data_texto, horario):
    """Insere com lock de escrita. Retorna (ok, mensagem).

    A garantia real contra conflito de horário é o UNIQUE(data, horario):
    mesmo se dois requests passarem pela checagem juntos, o segundo falha no
    banco em vez de criar duas reservas no mesmo slot.
    """
    try:
        conn.execute("BEGIN IMMEDIATE")
        existe = conn.execute(
            "SELECT 1 FROM agendamentos WHERE data = ? AND horario = ?", (data_texto, horario)
        ).fetchone()
        if existe:
            conn.execute("ROLLBACK")
            return False, "Esse horário acabou de ser reservado por outra pessoa. Escolha outro."
        conn.execute(
            "INSERT INTO agendamentos (usuario_id, servico_id, data, horario, confirmado, criado_em)"
            " VALUES (?, ?, ?, ?, 0, ?)",
            (usuario["id"], servico_id, data_texto, horario, datetime.now().isoformat(timespec="seconds")),
        )
        conn.execute("COMMIT")
        return True, "Agendamento realizado com sucesso!"
    except sqlite3.IntegrityError:
        conn.execute("ROLLBACK")
        return False, "Esse horário acabou de ser reservado por outra pessoa. Escolha outro."


def cancelar_agendamento(conn, agendamento_id, usuario):
    conn.execute("BEGIN IMMEDIATE")
    row = conn.execute("SELECT * FROM agendamentos WHERE id = ?", (agendamento_id,)).fetchone()
    if not row:
        conn.execute("ROLLBACK")
        return False, "Agendamento não encontrado."
    if not usuario["is_admin"] and row["usuario_id"] != usuario["id"]:
        conn.execute("ROLLBACK")
        return False, "Você só pode cancelar os seus agendamentos."
    conn.execute("DELETE FROM agendamentos WHERE id = ?", (agendamento_id,))
    conn.execute("COMMIT")
    return True, "Agendamento cancelado."
