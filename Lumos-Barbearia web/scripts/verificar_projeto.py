"""Verificacao de consistencia do projeto (sem testes de negocio, que estao em tests/).

  python scripts/verificar_projeto.py
"""
import os
import re
import sys
import tempfile
import unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
os.environ.setdefault("SECRET_KEY", "verificacao-local")
os.environ["DATABASE_PATH"] = os.path.join(tempfile.mkdtemp(), "v.db")

from app import app  # noqa: E402

FALHAS = []


def checar(condicao, mensagem):
    print(("  ok  " if condicao else "  XX  ") + mensagem)
    if not condicao:
        FALHAS.append(mensagem)


def arquivos_templates():
    pasta = os.path.join(RAIZ, "templates")
    return {n: open(os.path.join(pasta, n), encoding="utf-8").read()
            for n in sorted(os.listdir(pasta)) if n.endswith(".html")}


def main():
    templates = arquivos_templates()

    print("\n[1] CSS unico, arquivos mortos removidos")
    for n, t in templates.items():
        checar("<style" not in t, f"{n}: sem <style> inline")
    checar(not os.path.exists(os.path.join(RAIZ, "static", "style.css")),
           "static/style.css (duplicado) não existe mais")
    checar(not os.path.exists(os.path.join(RAIZ, "agenda.db")),
           "agenda.db (órfão) não existe mais")
    checar(not os.path.exists(os.path.join(RAIZ, "Lumos-Barbearia-main")),
           "pasta não está aninhada 3x")

    print("\n[2] Todo url_for() aponta para rota existente")
    endpoints = {r.endpoint for r in app.url_map.iter_rules()}
    for n, t in templates.items():
        quebrados = {u for u in re.findall(r"url_for\('([^']+)'", t)} - endpoints
        checar(not quebrados, f"{n}: endpoints validos" + (f" -> {quebrados}" if quebrados else ""))

    print("\n[3] Rotas publicas respondem / rotas privadas barram anonimo")
    c = app.test_client()
    for p in ("/", "/agendar", "/login", "/cadastro", "/privacidade"):
        checar(c.get(p).status_code == 200, f"GET {p} -> 200")
    for p in ("/admin", "/meus-agendamentos", "/conta", "/conta/exportar"):
        st = c.get(p).status_code
        checar(st in (302, 403), f"GET {p} anonimo -> {st} (302/403 esperado)")

    print("\n[4] Classes proprias usadas nos templates existem na folha de estilo")
    css = open(os.path.join(RAIZ, "static", "css", "style.css"), encoding="utf-8").read()
    no_css = set(re.split(r"[^A-Za-z0-9_-]+", css))       # inclui ".card-agenda.ok" -> tokens ok/passado
    usadas = set()
    for t in templates.values():
        limpo = re.sub(r"\{[%{].*?[%}]\}", " ", t, flags=re.S)   # tira Jinja do meio do class=""
        for grupo in re.findall(r'class="([^"]+)"', limpo):
            usadas.update(c for c in grupo.split() if c and not c.startswith("fa"))
    faltando = sorted(usadas - no_css)
    checar(not faltando, "classes proprias cobertas pelo CSS" + (f" -> faltando {faltando}" if faltando else ""))

    print("\n[5] Portugues integro (UTF-8) e sem dados de exemplo escondidos")
    for n, t in templates.items():
        checar("Ã" not in t and "Â" not in t, f"{n}: sem mojibake")
        checar(any(unicodedata.combining(ch) or ch in "áéíóúãõçâêôà" for ch in t)
               or n in ("base.html", "erro.html", "termo_lgpd.html"), f"{n}: acentuacao pt-BR preservada")
    fonte = open(os.path.join(RAIZ, "app.py"), encoding="utf-8").read()
    for lixo in ("'admin'", "5500000000000", "Rua Exemplo"):
        checar(lixo not in fonte, f"app.py não contem `{lixo}`")

    print("\n[6] requirements.txt e o README existem e estao em ASCII/UTF-8")
    req = open(os.path.join(RAIZ, "requirements.txt"), "rb").read()
    checar(not req.startswith(b"\xff\xfe") and not req.startswith(b"\xfe\xff"),
           "requirements.txt não está em UTF-16 (bug do arquivo original)")
    checar(os.path.exists(os.path.join(RAIZ, "README.md")), "README.md presente")

    print()
    if FALHAS:
        print(f"FALHOU: {len(FALHAS)} checagem(ns):")
        for f in FALHAS:
            print("   -", f)
        sys.exit(1)
    print("Tudo certo: projeto consistente.")


if __name__ == "__main__":
    main()
