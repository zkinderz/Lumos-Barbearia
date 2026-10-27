"""Lumos Barbearia - agenda online.

Flask + SQLite. Configucao sensivel vem de variaveis de ambiente (.env),
nunca do codigo. Veja README.md.
"""
import os
from datetime import date, datetime, timedelta
from functools import wraps

from flask import (
    Flask, abort, flash, g, jsonify, redirect, render_template, request,
    session, url_for,
)

from lumos import agenda, db, security

# ----------------------------------------------------------------- app -----
app = Flask(__name__)

PRODUCAO = os.environ.get("FLASK_ENV") == "production" or os.environ.get("DYNA") == "1"

_secreta = os.environ.get("SECRET_KEY")
if not _secreta:
    if PRODUCAO:
        raise RuntimeError("SECRET_KEY não definido. Em produção isso é obrigatório.")
    _secreta = "dev-apenas-nao-use-em-producao"

app.secret_key = _secreta
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=PRODUCAO,
    PERMANENT_SESSION_LIFETIME=timedelta(hours=12),
)

CAMINHO_BD = os.environ.get(
    "DATABASE_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "barbearia.db")
)

# Dados de contato: um unico lugar certo. Troque aqui (ou via .env) e reflete
# no rodape de todas as paginas.
BIZ = {
    "nome": "Lumos Barbearia",
    "endereco": os.environ.get("BIZ_ENDERECO", ""),
    "funcionamento": "Terca a Sabado, das 09h as 18h",
    "whatsapp": os.environ.get("BIZ_WHATSAPP", ""),
    "instagram": os.environ.get("BIZ_INSTAGRAM", ""),
    "email": os.environ.get("BIZ_EMAIL", ""),
    "responsavel": os.environ.get("BIZ_RESPONSAVEL", "Lumos Barbearia"),
}
VERSAO_LGPD = "2026.1"

db.inicializar(CAMINHO_BD)


def conectar():
    if "conn" not in g:
        g.conn = db.abrir(CAMINHO_BD)
    return g.conn


@app.teardown_appcontext
def fechar_conexao(exc):
    conn = g.pop("conn", None)
    if conn is not None:
        conn.close()


@app.before_request
def proteger_post_csrf():
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        security.validar_csrf()


def formatar_moeda(centavos):
    """12345 -> R$ 123,45 (padrao brasileiro)."""
    reais, c = divmod(int(centavos or 0), 100)
    return f"R$ {reais:,}".replace(",", ".") + f",{c:02d}"


app.jinja_env.filters["moeda"] = formatar_moeda


@app.context_processor
def variaveis_globais():
    return {
        "BIZ": BIZ,
        "VERSAO_LGPD": VERSAO_LGPD,
        "token_csrf": security.obter_token_csrf,
        "hoje_iso": date.today().isoformat(),
    }


def logado():
    return "usuario_id" in session


def exige_login(funcao):
    @wraps(funcao)
    def wrapper(*args, **kwargs):
        if not logado():
            destino = request.full_path if request.query_string else request.path
            session["destino_pos_login"] = destino if destino.startswith("/") else url_for("index")
            flash("Faça login ou cadastre-se para continuar.")
            return redirect(url_for("login"))
        return funcao(*args, **kwargs)
    return wrapper


def exige_admin(funcao):
    @wraps(funcao)
    def wrapper(*args, **kwargs):
        if not session.get("is_admin"):
            abort(403)
        return funcao(*args, **kwargs)
    return wrapper


def usuario_logado():
    return conectar().execute(
        "SELECT * FROM usuarios WHERE id = ?", (session["usuario_id"],)
    ).fetchone()


def iniciar_sessao(usuario):
    """Login: limpa e recria a sessao (evita fixacao de sessao antiga),
    preservando o que o cliente escolheu antes de autenticar."""
    guardar = {k: session[k] for k in ("agendamento_pendente", "destino_pos_login") if k in session}
    session.clear()
    session.permanent = True
    session.update(guardar)
    session["usuario_id"] = usuario["id"]
    session["nome"] = usuario["nome"]
    session["is_admin"] = bool(usuario["is_admin"])


# ------------------------------------------------------------ publico ----
@app.route("/")
def index():
    return render_template("index.html", servicos=db.servicos_ativos(conectar()))


@app.route("/privacidade")
def privacidade():
    return render_template("privacidade.html")


@app.errorhandler(403)
def erro_403(e):
    return render_template("erro.html", codigo=403, titulo="Acesso negado"), 403


@app.errorhandler(404)
def erro_404(e):
    return render_template("erro.html", codigo=404, titulo="Pagina nao encontrada"), 404


@app.errorhandler(405)
def erro_405(e):
    return render_template("erro.html", codigo=405, titulo="Metodo nao permitido"), 405


@app.errorhandler(500)
def erro_500(e):
    return render_template("erro.html", codigo=500, titulo="Erro interno"), 500


# -------------------------------------------------------------- contas ---
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = (request.form.get("email") or "").strip().lower()
        senha = request.form.get("senha") or ""
        chave = f"{request.remote_addr}|{email}"

        if security.login_bloqueado(chave):
            flash("Muitas tentativas seguidas. Aguarde 15 minutos e tente de novo.")
            return render_template("login.html"), 429

        usuario = conectar().execute(
            "SELECT * FROM usuarios WHERE lower(email) = ?", (email,)
        ).fetchone()

        if not usuario or not security.senha_confere(usuario["senha_hash"], senha):
            security.registrar_tentativa_falha(chave)
            flash("E-mail ou senha incorretos.")
            return render_template("login.html"), 401

        security.limpar_tentativas(chave)
        iniciar_sessao(usuario)

        if usuario["aceite_lgpd_versao"] != VERSAO_LGPD:
            return redirect(url_for("termo_lgpd"))

        destino = session.pop("destino_pos_login", None)
        ok, msg = concluir_agendamento_pendente(conectar(), usuario)
        if msg:
            flash(msg)
        if ok:
            return redirect(url_for("meus_agendamentos"))
        if destino:
            return redirect(destino)
        return redirect(url_for("admin") if usuario["is_admin"] else url_for("index"))

    return render_template("login.html")


@app.route("/cadastro", methods=["GET", "POST"])
def cadastro():
    if request.method == "POST":
        nome = (request.form.get("nome") or "").strip()
        email = (request.form.get("email") or "").strip().lower()
        senha = request.form.get("senha") or ""
        telefone, erro_tel = agenda.validar_telefone(request.form.get("telefone"))
        erros = []

        if len(nome) < 2:
            erros.append("Informe seu nome completo.")
        if not email or "@" not in email or " " in email:
            erros.append("Informe um e-mail valido.")
        if not security.senha_forte(senha):
            erros.append("A senha precisa ter pelo menos 8 caracteres.")
        if erro_tel:
            erros.append(erro_tel)
        if request.form.get("lgpd") != "on":
            erros.append("E preciso aceitar os termos da LGPD para se cadastrar.")

        if erros:
            for e in erros:
                flash(e)
            return render_template(
                "cadastro.html", form={"nome": nome, "email": email,
                                       "telefone": request.form.get("telefone", "")}
            ), 400

        conn = conectar()
        if conn.execute("SELECT 1 FROM usuarios WHERE lower(email) = ?", (email,)).fetchone():
            flash("E-mail já cadastrado. Tente fazer login.")
            return redirect(url_for("login"))

        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                "INSERT INTO usuarios (nome, email, telefone, senha_hash, is_admin,"
                " aceite_lgpd_versao, data_aceite_lgpd) VALUES (?, ?, ?, ?, 0, ?, ?)",
                (nome, email, telefone, security.gerar_hash(senha), VERSAO_LGPD,
                 datetime.now().isoformat(timespec="seconds")),
            )
            novo_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            flash("Não foi possível concluir o cadastro. Tente novamente.")
            return redirect(url_for("cadastro"))

        novo = conn.execute("SELECT * FROM usuarios WHERE id = ?", (novo_id,)).fetchone()
        iniciar_sessao(novo)
        flash("Cadastro realizado com sucesso!")

        ok, msg = concluir_agendamento_pendente(conn, novo)
        if msg:
            flash(msg)
        return redirect(url_for("meus_agendamentos") if ok else url_for("index"))

    return render_template("cadastro.html", form={})


@app.route("/termo-lgpd", methods=["GET", "POST"])
@exige_login
def termo_lgpd():
    if request.method == "POST":
        if request.form.get("lgpd") != "on":
            flash("É preciso aceitar os termos para continuar.")
            return render_template("termo_lgpd.html"), 400
        conn = conectar()
        conn.execute(
            "UPDATE usuarios SET aceite_lgpd_versao = ?, data_aceite_lgpd = ? WHERE id = ?",
            (VERSAO_LGPD, datetime.now().isoformat(timespec="seconds"), session["usuario_id"]),
        )
        flash("Obrigado! Consentimento registrado.")
        usuario = usuario_logado()
        ok, msg = concluir_agendamento_pendente(conectar(), usuario)
        if msg:
            flash(msg)
        return redirect(url_for("meus_agendamentos") if ok else url_for("index"))
    return render_template("termo_lgpd.html")


@app.route("/logout", methods=["POST"])
@exige_login
def logout():
    session.clear()
    flash("Você saiu do sistema.")
    return redirect(url_for("index"))


@app.route("/conta/excluir", methods=["POST"])
@exige_login
def excluir_conta():
    """Direito de eliminacao (art. 18 LGPD)."""
    usuario = usuario_logado()
    if usuario["is_admin"]:
        flash("A conta de administrador não pode ser excluída por aqui.")
        return redirect(url_for("conta"))
    if not security.senha_confere(usuario["senha_hash"], request.form.get("senha") or ""):
        flash("Senha incorreta. A exclusão não foi feita.")
        return redirect(url_for("conta"))

    conn = conectar()
    conn.execute("BEGIN IMMEDIATE")
    # Cancela o que ainda vai acontecer (libera os horarios) e apaga a conta.
    conn.execute(
        "DELETE FROM agendamentos WHERE usuario_id = ? AND data >= ?",
        (usuario["id"], date.today().isoformat()),
    )
    conn.execute("DELETE FROM usuarios WHERE id = ?", (usuario["id"],))
    conn.execute("COMMIT")
    session.clear()
    flash("Sua conta e seus dados foram excluídos.")
    return redirect(url_for("index"))


@app.route("/conta/exportar")
@exige_login
def exportar_conta():
    """Direito de portabilidade/acesso (art. 18 LGPD): os dados do proprio cliente."""
    usuario = usuario_logado()
    conn = conectar()
    agenda_rows = conn.execute(
        "SELECT a.data, a.horario, a.confirmado, a.criado_em, s.nome AS servico"
        " FROM agendamentos a JOIN servicos s ON s.id = a.servico_id"
        " WHERE a.usuario_id = ? ORDER BY a.data, a.horario",
        (usuario["id"],),
    ).fetchall()
    dados = {
        "usuario": {
            "nome": usuario["nome"], "email": usuario["email"],
            "telefone": usuario["telefone"],
            "consentimento_lgpd": usuario["aceite_lgpd_versao"],
            "data_consentimento": usuario["data_aceite_lgpd"],
        },
        "agendamentos": [dict(r) for r in agenda_rows],
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        "controlador": BIZ["responsavel"],
    }
    resposta = jsonify(dados)
    resposta.headers["Content-Disposition"] = "attachment; filename=lumos-seus-dados.json"
    return resposta


@app.route("/conta")
@exige_login
def conta():
    return render_template("conta.html", usuario=usuario_logado())


# ------------------------------------------------------- agendamento ------
@app.route("/agendar", methods=["GET", "POST"])
def agendar():
    conn = conectar()
    servicos = db.servicos_ativos(conn)

    if request.method == "POST":
        data_texto = (request.form.get("data") or "").strip()
        horario = (request.form.get("horario") or "").strip()
        servico_id = request.form.get("servico_id")

        d, erro = agenda.validar_data(data_texto)
        erros = [erro] if erro else []
        if not erros:
            _, erro = agenda.validar_horario(horario, d)
            erros += [erro] if erro else []
        servico = None
        if not erros:
            servico, erro = agenda.validar_servico(conn, str(servico_id))
            erros += [erro] if erro else []

        if erros:
            for e in erros:
                flash(e)
            return (
                render_template(
                    "agendar.html", servicos=servicos,
                    data_selecionada=data_texto,
                    horarios=agenda.horarios_livres(conn, data_texto),
                ),
                400,
            )

        if not logado():
            session["agendamento_pendente"] = {
                "data": data_texto, "horario": horario, "servico_id": servico["id"],
            }
            flash("Para concluir o agendamento, faça login ou cadastre-se!")
            return redirect(url_for("login"))

        ok, msg = agenda.criar_agendamento(
            conn, usuario_logado(), servico["id"], data_texto, horario
        )
        flash(msg)
        return redirect(url_for("meus_agendamentos") if ok else url_for("agendar"))

    data_texto = (request.args.get("data") or "").strip()
    horarios = []
    if data_texto:
        _, erro = agenda.validar_data(data_texto)
        if erro:
            flash(erro)
            return redirect(url_for("agendar"))
        horarios = agenda.horarios_livres(conn, data_texto)

    return render_template(
        "agendar.html", servicos=servicos, horarios=horarios,
        data_selecionada=data_texto,
    )


def concluir_agendamento_pendente(conn, usuario):
    """Conclui a reserva que o cliente escolheu antes de ter conta.

    Roda dentro do proprio request de login/cadastro: nada de rota GET que
    grava no banco. Retorna a mensagem para exibir, ou None se nao havia nada.
    """
    pendente = session.pop("agendamento_pendente", None)
    if not pendente:
        return (False, None)

    d, erro = agenda.validar_data(pendente["data"])
    if not erro:
        _, erro = agenda.validar_horario(pendente["horario"], d)
    servico = None
    if not erro:
        servico, erro = agenda.validar_servico(conn, str(pendente["servico_id"]))
    if erro:
        return (False, f"Seu agendamento pendente não vale mais: {erro}")

    return agenda.criar_agendamento(
        conn, usuario, servico["id"], pendente["data"], pendente["horario"]
    )


@app.route("/meus-agendamentos")
@exige_login
def meus_agendamentos():
    conn = conectar()
    linhas = conn.execute(
        "SELECT a.*, s.nome AS servico, s.preco_centavos, s.duracao_min"
        " FROM agendamentos a JOIN servicos s ON s.id = a.servico_id"
        " WHERE a.usuario_id = ? ORDER BY a.data, a.horario",
        (session["usuario_id"],),
    ).fetchall()
    return render_template("meus_agendamentos.html", agendamentos=linhas,
                           dias_abertos="Terca a Sabado")


@app.route("/confirmar-presenca/<int:agenda_id>", methods=["POST"])
@exige_login
def confirmar_presenca(agenda_id):
    """Cliente confirma que vai comparecer. So funciona na sua propria reserva."""
    conn = conectar()
    row = conn.execute(
        "SELECT * FROM agendamentos WHERE id = ? AND usuario_id = ?",
        (agenda_id, session["usuario_id"]),
    ).fetchone()
    if not row:
        abort(403)
    if row["data"] < date.today().isoformat():
        flash("Esse agendamento já passou.")
    else:
        conn.execute("UPDATE agendamentos SET confirmado = 1 WHERE id = ?", (agenda_id,))
        flash("Presença confirmada. Te esperamos lá!")
    return redirect(url_for("meus_agendamentos"))


@app.route("/cancelar/<int:agenda_id>", methods=["POST"])
@exige_login
def cancelar(agenda_id):
    ok, msg = agenda.cancelar_agendamento(conectar(), agenda_id, usuario_logado())
    flash(msg)
    return redirect(url_for("admin") if session.get("is_admin") else url_for("meus_agendamentos"))


# --------------------------------------------------------------- admin ----
@app.route("/admin")
@exige_admin
def admin():
    conn = conectar()
    data = (request.args.get("data") or "").strip()
    if data:
        d, erro = agenda.validar_data(data)
        if erro:
            flash(erro)
            return redirect(url_for("admin"))
        linhas = conn.execute(
            "SELECT a.*, u.nome AS cliente, u.telefone, s.nome AS servico"
            " FROM agendamentos a JOIN usuarios u ON u.id = a.usuario_id"
            " JOIN servicos s ON s.id = a.servico_id WHERE a.data = ?"
            " ORDER BY a.horario",
            (data,),
        ).fetchall()
    else:
        linhas = conn.execute(
            "SELECT a.*, u.nome AS cliente, u.telefone, s.nome AS servico"
            " FROM agendamentos a JOIN usuarios u ON u.id = a.usuario_id"
            " JOIN servicos s ON s.id = a.servico_id"
            " ORDER BY a.data DESC, a.horario"
        ).fetchall()

    proximos = conn.execute(
        "SELECT COUNT(*) AS n FROM agendamentos WHERE data >= ?", (date.today().isoformat(),)
    ).fetchone()["n"]
    return render_template("admin.html", agendamentos=linhas, data_selecionada=data,
                           total_proximos=proximos)


@app.route("/admin/confirmar/<int:agenda_id>", methods=["POST"])
@exige_admin
def admin_confirmar(agenda_id):
    conectar().execute("UPDATE agendamentos SET confirmado = 1 WHERE id = ?", (agenda_id,))
    flash("Agendamento confirmado.")
    return redirect(request.referrer or url_for("admin"))


def bootstrap_admin():
    """So cria admin se ADMIN_EMAIL e ADMIN_PASSWORD existirem no ambiente."""
    email = (os.environ.get("ADMIN_EMAIL") or "").strip().lower()
    senha = os.environ.get("ADMIN_PASSWORD") or ""
    if not email or not senha:
        return None
    if not security.senha_forte(senha):
        print("[lumos] ADMIN_PASSWORD precisa ter no mínimo 8 caracteres - admin nao criado.")
        return None
    conn = db.abrir(CAMINHO_BD)
    try:
        existe = conn.execute("SELECT * FROM usuarios WHERE lower(email) = ?", (email,)).fetchone()
        if existe:
            return existe["id"]
        conn.execute(
            "INSERT INTO usuarios (nome, email, telefone, senha_hash, is_admin,"
            " aceite_lgpd_versao, data_aceite_lgpd) VALUES (?, ?, ?, ?, 1, ?, ?)",
            ("Administrador", email, "", security.gerar_hash(senha), VERSAO_LGPD,
             datetime.now().isoformat(timespec="seconds")),
        )
        novo = conn.execute("SELECT id FROM usuarios WHERE lower(email) = ?", (email,)).fetchone()
        print(f"[lumos] admin criado para {email}")
        return novo["id"]
    finally:
        conn.close()


def avisar_campos_vazios():
    faltando = [k for k in ("endereco", "whatsapp", "email", "responsavel") if not BIZ[k]]
    if faltando:
        print("[lumos] AVISO: contato(s) não configurados: " + ", ".join(
            "BIZ_" + f.upper() for f in faltando) + ". Preencha no .env para aparecerem no site.")


avisar_campos_vazios()

if bootstrap_admin() is None:
    _conn = db.abrir(CAMINHO_BD)
    _tem_admin = _conn.execute("SELECT 1 FROM usuarios WHERE is_admin = 1 LIMIT 1").fetchone()
    _conn.close()
    if not _tem_admin:
        print("[lumos] AVISO: nenhuma conta de administrador existe. Defina ADMIN_EMAIL e"
              " ADMIN_PASSWORD no ambiente e reinicie para criar a sua.")

if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1")
