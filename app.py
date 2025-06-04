import os
import sqlite3
from datetime import datetime, timedelta
from flask import Flask, render_template, request, redirect, url_for

app = Flask(__name__)

# Define o caminho para o banco de dados dentro do diretório /tmp
# O diretório /tmp é gravável no ambiente do Render
DB_PATH = os.path.join('/tmp', 'agenda.db')

def get_db_connection():
    # Tenta conectar ao DB_PATH. Se o arquivo não existir, ele será criado.
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Bloco para inicializar o banco de dados e criar a tabela
# Ele será executado quando a aplicação Flask for carregada pelo Gunicorn
try:
    conn = get_db_connection()
    conn.execute('''
    CREATE TABLE IF NOT EXISTS agendamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        telefone TEXT,
        data TEXT,
        horario TEXT,
        confirmado INTEGER DEFAULT 0
    )
    ''')
    conn.commit()
    conn.close()
    print("Banco de dados inicializado e tabela 'agendamentos' verificada/criada.")
except sqlite3.Error as e:
    print(f"Erro ao inicializar o banco de dados: {e}")
    # Em um ambiente de produção real, você pode querer registrar este erro
    # de forma mais robusta ou até mesmo fazer a aplicação falhar se o DB não puder ser criado.

def gerar_horarios():
    horarios = []
    inicio = datetime.strptime("09:00", "%H:%M")
    fim = datetime.strptime("18:00", "%H:%M")
    while inicio <= fim:
        horarios.append(inicio.strftime("%H:%M"))
        inicio += timedelta(minutes=40)
    return horarios

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/agendar', methods=['GET', 'POST'])
def agendar():
    horarios_disponiveis = gerar_horarios()

    if request.method == 'POST':
        nome = request.form['nome']
        telefone = request.form['telefone']
        data = request.form['data']
        horario = request.form['horario']

        conn = get_db_connection()
        conn.execute('INSERT INTO agendamentos (nome, telefone, data, horario) VALUES (?, ?, ?, ?)',
                     (nome, telefone, data, horario))
        conn.commit()
        conn.close()
        return redirect(url_for('meus_agendamentos'))

    data = request.args.get('data')
    if data:
        conn = get_db_connection()
        ocupados = conn.execute('SELECT horario FROM agendamentos WHERE data = ?', (data,)).fetchall()
        conn.close()
        ocupados = [o['horario'] for o in ocupados]
        horarios_disponiveis = [h for h in horarios_disponiveis if h not in ocupados]

    return render_template('agendar.html', horarios=horarios_disponiveis)

@app.route('/admin')
def admin():
    data = request.args.get('data')
    agendamentos = []
    if data:
        conn = get_db_connection()
        agendamentos = conn.execute('SELECT * FROM agendamentos WHERE data = ? ORDER BY horario', (data,)).fetchall()
        conn.close()
    return render_template('admin.html', agendamentos=agendamentos)

@app.route('/meus_agendamentos', methods=['GET', 'POST'])
def meus_agendamentos():
    if request.method == 'POST':
        telefone = request.form['telefone']
        conn = get_db_connection()
        agendamentos = conn.execute('SELECT * FROM agendamentos WHERE telefone = ?', (telefone,)).fetchall()
        conn.close()
        return render_template('meus_agendamentos.html', agendamentos=agendamentos, telefone=telefone)
    return render_template('meus_agendamentos.html')

@app.route('/confirmar/<int:id>')
def confirmar(id):
    conn = get_db_connection()
    conn.execute('UPDATE agendamentos SET confirmado = 1 WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return redirect(url_for('meus_agendamentos'))

# O bloco abaixo não deve rodar em produção com o Gunicorn, apenas para desenvolvimento local
# if __name__ == '__main__':
#    app.run(debug=True)