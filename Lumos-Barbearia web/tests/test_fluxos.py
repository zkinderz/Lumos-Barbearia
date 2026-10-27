"""Provas de que os buracos foram fechados.

  python -m unittest discover -s tests -v

Cada teste usa um banco SQLite temporario: nada toca no seu data/barbearia.db.
"""
import os
import re
import tempfile
import unittest
from datetime import date, timedelta


def _ambiente_isolado():
    fd, caminho = tempfile.mkstemp(prefix="lumos-teste-", suffix=".db")
    os.close(fd)
    os.unlink(caminho)
    os.environ["DATABASE_PATH"] = caminho
    os.environ["SECRET_KEY"] = "chave-de-teste"
    os.environ["ADMIN_EMAIL"] = "chefe@lumos.test"
    os.environ["ADMIN_PASSWORD"] = "senha-do-chefe-9"
    return caminho


_ambiente_isolado()

from app import app, CAMINHO_BD, VERSAO_LGPD, db  # noqa: E402


def mais_tera(dias=7):
    d = date.today() + timedelta(days=dias)
    while d.weekday() not in agenda_abertos():
        d += timedelta(days=1)
    return d


def agenda_abertos():
    from lumos.agenda import DIAS_ABERTOS
    return DIAS_ABERTOS


def token_csrf(cliente, caminho="/login"):
    """Le o token do <meta name="csrf-token">, presente em toda pagina."""
    html = cliente.get(caminho).get_data(as_text=True)
    m = re.search(r'name="csrf-token" content="([^"]+)"', html)
    return m.group(1) if m else None


class Base(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        db.inicializar(CAMINHO_BD)          # banco limpo para cada teste
        from app import bootstrap_admin
        bootstrap_admin()
        from lumos import security
        security._TENTATIVOS.clear()        # zera o rate limit entre testes
        self.c = app.test_client()

    def tearDown(self):
        for ext in ("", "-wal", "-shm"):
            p = CAMINHO_BD + ext
            if os.path.exists(p):
                os.remove(p)

    def cadastrar(self, nome="Joao Teste", email=None, senha="senha-forte-123", tel="11988887777"):
        email = email or f"{abs(hash(nome + str(len(nome))))}@teste.com"
        t = token_csrf(self.c, "/cadastro")
        r = self.c.post("/cadastro", data={
            "csrf_token": t, "nome": nome, "email": email, "telefone": tel,
            "senha": senha, "lgpd": "on",
        }, follow_redirects=False)
        return r, email

    def agendar(self, data, horario, servico_id=1):
        return self.c.post("/agendar", data={
            "csrf_token": token_csrf(self.c, "/agendar"),
            "data": data, "horario": horario, "servico_id": str(servico_id),
        })


class TestSenhaESessao(Base):
    def test_senha_nunca_em_texto_puro(self):
        self.cadastrar(senha="senha-forte-123")
        conn = db.abrir(CAMINHO_BD)
        hash_gravado = conn.execute(
            "SELECT senha_hash FROM usuarios WHERE nome = 'Joao Teste'"
        ).fetchone()["senha_hash"]
        conn.close()
        self.assertNotIn("senha-forte-123", hash_gravado)
        self.assertTrue(hash_gravado.startswith("pbkdf2:"))

    def test_sem_conta_admin_padrao(self):
        conn = db.abrir(CAMINHO_BD)
        admin = conn.execute("SELECT email, senha_hash FROM usuarios WHERE is_admin = 1").fetchone()
        total = conn.execute("SELECT COUNT(*) n FROM usuarios").fetchone()["n"]
        conn.close()
        self.assertTrue(admin)
        self.assertEqual(admin["email"], "chefe@lumos.test")
        self.assertNotEqual(admin["senha_hash"], "admin")
        # nao existe mais usuario com email/senha 'admin'/'admin'
        conn = db.abrir(CAMINHO_BD)
        ruim = conn.execute("SELECT 1 FROM usuarios WHERE email = 'admin'").fetchone()
        conn.close()
        self.assertIsNone(ruim)

    def test_login_bloqueia_forca_bruta(self):
        self.cadastrar(email="alvo@teste.com", senha="senha-forte-123")
        for _ in range(11):  # acima do limite de 10 tentativas
            r = self.c.post("/login", data={
                "csrf_token": token_csrf(self.c), "email": "alvo@teste.com", "senha": "errada"
            })
        self.assertEqual(r.status_code, 429)

    def test_post_sem_csrf_e_recusado(self):
        self.c.post("/cadastro", data={"nome": "x", "email": "x@y.com", "telefone": "11988887777",
                                       "senha": "12345678", "lgpd": "on"})
        conn = db.abrir(CAMINHO_BD)
        n = conn.execute("SELECT COUNT(*) n FROM usuarios WHERE email = 'x@y.com'").fetchone()["n"]
        conn.close()
        self.assertEqual(n, 0)


class TestConflitoDeHorario(Base):
    def test_dois_cliques_no_mesmo_slot_gera_uma_reserva(self):
        self.cadastrar()
        data = mais_tera().isoformat()
        r1 = self.agendar(data, "10:20")
        self.assertEqual(r1.status_code, 302)
        r2 = self.agendar(data, "10:20")
        conn = db.abrir(CAMINHO_BD)
        n = conn.execute("SELECT COUNT(*) n FROM agendamentos WHERE data=? AND horario=?",
                         (data, "10:20")).fetchone()["n"]
        conn.close()
        self.assertEqual(n, 1, "slot duplicado: o UNIQUE/data+horario nao esta valendo")

    def test_slot_aparece_como_indisponivel_para_o_proximo_cliente(self):
        data = mais_tera().isoformat()
        self.cadastrar(nome="Primeiro", email="p@t.com")
        self.agendar(data, "09:00")
        self.c.post("/logout", data={"csrf_token": token_csrf(self.c, "/")})
        self.cadastrar(nome="Segundo", email="s@t.com")
        html = self.c.get(f"/agendar?data={data}").get_data(as_text=True)
        self.assertNotIn(">09:00<", html)
        r = self.agendar(data, "09:00")
        self.assertEqual(r.status_code, 302)
        conn = db.abrir(CAMINHO_BD)
        n = conn.execute("SELECT COUNT(*) n FROM agendamentos WHERE data=? AND horario=?",
                         (data, "09:00")).fetchone()["n"]
        conn.close()
        self.assertEqual(n, 1)


class TestValidacaoNoServidor(Base):
    def test_data_passada_recusada(self):
        self.cadastrar()
        ontem = (date.today() - timedelta(days=1)).isoformat()
        r = self.agendar(ontem, "11:00")
        self.assertEqual(r.status_code, 400)
        conn = db.abrir(CAMINHO_BD)
        self.assertEqual(conn.execute("SELECT COUNT(*) n FROM agendamentos").fetchone()["n"], 0)
        conn.close()

    def test_segunda_e_domingo_fechado(self):
        self.cadastrar()
        d = date.today() + timedelta(days=3)
        while d.weekday() not in (0, 6):
            d += timedelta(days=1)
        r = self.agendar(d.isoformat(), "11:00")
        self.assertEqual(r.status_code, 400)
        self.assertTrue("fechada" in r.get_data(as_text=True).lower()
                        or "fechada" in self.c.get("/agendar").get_data(as_text=True).lower())

    def test_horario_fora_da_grade_recusado(self):
        self.cadastrar()
        r = self.agendar(mais_tera(9).isoformat(), "23:59")
        self.assertEqual(r.status_code, 400)

    def test_servico_inexistente_recusado(self):
        self.cadastrar()
        r = self.agendar(mais_tera(11).isoformat(), "11:40", servico_id=999)
        self.assertEqual(r.status_code, 400)

    def test_data_adulta_novo_formato_recusada(self):
        self.cadastrar()
        r = self.c.post("/agendar", data={
            "csrf_token": token_csrf(self.c, "/agendar"),
            "data": "01/01/2099", "horario": "09:00", "servico_id": "1"})
        self.assertEqual(r.status_code, 400)


class TestPermissoes(Base):
    def test_cliente_nao_confirma_no_lugar_do_admin(self):
        self.cadastrar()
        data = mais_tera(13).isoformat()
        self.agendar(data, "13:00")
        conn = db.abrir(CAMINHO_BD)
        rid = conn.execute("SELECT id FROM agendamentos WHERE data=?", (data,)).fetchone()["id"]
        conn.close()
        r = self.c.post(f"/admin/confirmar/{rid}", data={"csrf_token": token_csrf(self.c, "/")})
        self.assertEqual(r.status_code, 403)

    def test_cliente_nao_ve_painel(self):
        self.cadastrar()
        self.assertEqual(self.c.get("/admin").status_code, 403)

    def test_admin_get_e_bloqueado_para_anonimo(self):
        self.assertEqual(self.c.get("/admin").status_code, 403)
        self.assertEqual(self.c.get("/meus-agendamentos").status_code, 302)

    def test_rotas_antigas_de_get_mutante_nao_existem_mais(self):
        # GET /logout, GET /confirmar/<id> e GET /cancelar/<id> escreviam no banco
        self.assertEqual(self.c.get("/logout").status_code, 405)
        self.assertEqual(self.c.get("/confirmar/1").status_code, 404)
        self.assertEqual(self.c.get("/admin/confirmar/1").status_code, 405)

    def test_cancelar_so_por_get_e_impossivel(self):
        r = self.c.get("/cancelar/1")
        self.assertIn(r.status_code, (405, 302))

    def test_cliente_nao_cancela_reserva_alheia(self):
        self.cadastrar(nome="Alice Um", email="a@t.com")
        data = mais_tera(15).isoformat()
        self.agendar(data, "15:00")
        conn = db.abrir(CAMINHO_BD)
        rid = conn.execute("SELECT id FROM agendamentos WHERE data=?", (data,)).fetchone()["id"]
        conn.close()
        self.c.post("/logout", data={"csrf_token": token_csrf(self.c, "/")})
        self.cadastrar(nome="Bruno Dois", email="b@t.com")
        self.c.post(f"/cancelar/{rid}", data={"csrf_token": token_csrf(self.c, "/conta")})
        conn = db.abrir(CAMINHO_BD)
        self.assertEqual(conn.execute("SELECT COUNT(*) n FROM agendamentos WHERE id=?",
                                      (rid,)).fetchone()["n"], 1)
        conn.close()

    def test_admin_consegue_logar_e_ver_agenda(self):
        r = self.c.post("/login", data={
            "csrf_token": token_csrf(self.c), "email": "chefe@lumos.test",
            "senha": "senha-do-chefe-9"})
        self.assertEqual(r.status_code, 302)
        self.assertEqual(self.c.get("/admin").status_code, 200)


class TestPaginas(Base):
    def test_paginas_publicas_respondem_200(self):
        for p in ("/", "/agendar", "/login", "/cadastro", "/privacidade"):
            self.assertEqual(self.c.get(p).status_code, 200, p)

    def test_busca_por_telefone_morta_foi_removida(self):
        self.cadastrar()
        html = self.c.get("/meus-agendamentos").get_data(as_text=True)
        self.assertNotIn('name="telefone"', html)
        self.assertIn(self.c.post("/meus-agendamentos", data={}).status_code, (400, 405))  # 400 CSRF / 405 method

    def test_servicos_com_preco_vem_do_banco(self):
        html = self.c.get("/").get_data(as_text=True)
        self.assertIn("Corte Moderno", html)
        self.assertIn("45,00", html)

    def test_404_e_csrf_invalido_tratados(self):
        self.assertEqual(self.c.get("/nao-existe").status_code, 404)
        r = self.c.post("/login", data={"csrf_token": "forjado", "email": "a", "senha": "b"})
        self.assertEqual(r.status_code, 400)


class TestLGPD(Base):
    def test_consentimento_registrado_com_versao(self):
        self.cadastrar()
        conn = db.abrir(CAMINHO_BD)
        u = conn.execute("SELECT aceite_lgpd_versao, data_aceite_lgpd FROM usuarios WHERE nome='Joao Teste'").fetchone()
        conn.close()
        self.assertEqual(u["aceite_lgpd_versao"], VERSAO_LGPD)
        self.assertTrue(u["data_aceite_lgpd"])

    def test_exportar_e_excluir_conta(self):
        self.cadastrar(email="portabilidade@t.com")
        data = mais_tera(20).isoformat()
        self.agendar(data, "16:20")
        r = self.c.get("/conta/exportar")
        self.assertEqual(r.status_code, 200)
        corpo = r.get_json()
        self.assertEqual(corpo["usuario"]["email"], "portabilidade@t.com")
        self.assertTrue(corpo["agendamentos"])

        r = self.c.post("/conta/excluir", data={
            "csrf_token": token_csrf(self.c, "/conta"), "senha": "senha-forte-123"})
        self.assertEqual(r.status_code, 302)
        conn = db.abrir(CAMINHO_BD)
        self.assertEqual(conn.execute("SELECT COUNT(*) n FROM usuarios WHERE email='portabilidade@t.com'").fetchone()["n"], 0)
        nagenda = conn.execute("SELECT COUNT(*) n FROM agendamentos WHERE data=?", (data,)).fetchone()["n"]
        conn.close()
        self.assertEqual(nagenda, 0, "excluir conta deve liberar o horario futuro")

    def test_excluir_conta_exige_senha(self):
        self.cadastrar(email="medo@t.com")
        self.c.post("/conta/excluir", data={"csrf_token": token_csrf(self.c, "/conta"), "senha": "errada"})
        conn = db.abrir(CAMINHO_BD)
        self.assertEqual(conn.execute("SELECT 1 FROM usuarios WHERE email='medo@t.com'").fetchone() is not None, True)
        conn.close()


class TestFluxoSemConta(Base):
    def test_escolhe_horario_depois_loga_reserva_conclui(self):
        data = mais_tera(21).isoformat()
        r = self.c.post("/agendar", data={
            "csrf_token": token_csrf(self.c, "/agendar"),
            "data": data, "horario": "17:00", "servico_id": "2"})
        self.assertEqual(r.status_code, 302)
        self.assertIn("/login", r.headers["Location"])
        self.c.get("/login")
        self.c.post("/login", data={
            "csrf_token": token_csrf(self.c), "email": "novo@t.com", "senha": "nao-importa"})
        r, email = self.cadastrar(nome="Novo Cliente", email="novo@t.com")
        conn = db.abrir(CAMINHO_BD)
        linha = conn.execute("SELECT a.*, u.nome FROM agendamentos a JOIN usuarios u ON u.id=a.usuario_id"
                             " WHERE a.data=? AND a.horario='17:00'", (data,)).fetchone()
        conn.close()
        self.assertIsNotNone(linha, "flujo anonimato -> login deveria ter concluido a reserva")
        self.assertEqual(linha["nome"], "Novo Cliente")
        self.assertEqual(linha["servico_id"], 2)


class TestConsentimentoEReservaPendente(Base):
    def test_reserva_pendente_sobreveve_a_tela_de_consentimento(self):
        """Cliente sem conta escolhe horario, faz login em conta antiga que ainda
        nao aceitou a versao nova da politica: a reserva nao pode se perder."""
        from lumos import security
        conn = db.abrir(CAMINHO_BD)
        conn.execute(
            "INSERT INTO usuarios (nome, email, telefone, senha_hash, is_admin,"
            " aceite_lgpd_versao) VALUES ('Usuario Antigo', 'antigo@t.com', '11988880000', ?, 0, NULL)",
            (security.gerar_hash("senha-forte-123"),),
        )
        conn.close()

        data = mais_tera(23).isoformat()
        r = self.c.post("/agendar", data={
            "csrf_token": token_csrf(self.c, "/agendar"),
            "data": data, "horario": "12:20", "servico_id": "1"})
        self.assertEqual(r.status_code, 302)

        self.c.post("/login", data={"csrf_token": token_csrf(self.c),
                                    "email": "antigo@t.com", "senha": "senha-forte-123"})
        # em vez de gravar direto, o app manda aceitar a politica primeiro
        self.c.get("/termo-lgpd")
        self.c.post("/termo-lgpd", data={"csrf_token": token_csrf(self.c, "/termo-lgpd"), "lgpd": "on"})

        conn = db.abrir(CAMINHO_BD)
        linha = conn.execute("SELECT a.*, u.nome FROM agendamentos a JOIN usuarios u ON u.id=a.usuario_id"
                             " WHERE a.data=? AND a.horario='12:20'", (data,)).fetchone()
        aceite = conn.execute("SELECT aceite_lgpd_versao FROM usuarios WHERE email='antigo@t.com'").fetchone()
        conn.close()
        self.assertIsNotNone(linha, "a reserva escolhida antes do consentimento deveria existir")
        self.assertEqual(linha["nome"], "Usuario Antigo")
        self.assertEqual(aceite["aceite_lgpd_versao"], VERSAO_LGPD)


if __name__ == "__main__":
    unittest.main(verbosity=2)
