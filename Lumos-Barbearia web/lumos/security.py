"""Senhas, CSRF e limitacao de tentativas de login."""
import hmac
import secrets
import time
from collections import defaultdict, deque

from flask import abort, g, request, session
from werkzeug.security import check_password_hash, generate_password_hash

# ------------------------------------------------------------------ senhas --
def gerar_hash(senha):
    return generate_password_hash(senha, method="pbkdf2:sha256:600000")


def senha_confere(senha_hash, senha_digitada):
    return bool(senha_hash) and check_password_hash(senha_hash, senha_digitada)


def senha_forte(senha):
    return bool(senha) and len(senha) >= 8


# ------------------------------------------------------------------- CSRF ---
def obter_token_csrf():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_urlsafe(32)
    return session["csrf_token"]


def validar_csrf():
    enviado = request.form.get("csrf_token") or request.headers.get("X-CSRF-Token")
    esperado = session.get("csrf_token")
    if not esperado or not enviado or not hmac.compare_digest(enviado, esperado):
        abort(400, description="Sessão expirada ou formulário inválido (CSRF).")


# ------------------------------------------------- rate limit do login ------
_TENTATIVOS = defaultdict(deque)
JANELA_SEGUNDOS = 900
MAX_TENTATIVOS = 10  # por IP + e-mail; 15 min de espera ao estourar


def login_bloqueado(chave):
    agora = time.monotonic()
    fila = _TENTATIVOS[chave]
    while fila and agora - fila[0] > JANELA_SEGUNDOS:
        fila.popleft()
    return len(fila) >= MAX_TENTATIVOS


def registrar_tentativa_falha(chave):
    _TENTATIVOS[chave].append(time.monotonic())


def limpar_tentativas(chave):
    _TENTATIVOS.pop(chave, None)
