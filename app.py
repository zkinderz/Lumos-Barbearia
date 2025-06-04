from flask import Flask, render_template, request, redirect, url_for
import sqlite3
from datetime import datetime, timedelta

app = Flask(__name__)

<<<<<<< HEAD
# Banco de dados
=======
>>>>>>> 677ae04b7af11208e1c626c5a430817c9701fc4f
def get_db_connection():
    conn = sqlite3.connect('agenda.db')
    conn.row_factory = sqlite3.Row
    return conn

<<<<<<< HEAD
# Criação do banco se não existir
=======
>>>>>>> 677ae04b7af11208e1c626c5a430817c9701fc4f
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

<<<<<<< HEAD
# Gerar horários de 40 em 40 minutos
=======
>>>>>>> 677ae04b7af11208e1c626c5a430817c9701fc4f
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
        return redirect(url_for('index'))

    data = request.args.get('data')
    horarios_disponiveis = gerar_horarios()

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
    return redirect(url_for('index'))

if __name__ == '__main__':
<<<<<<< HEAD
    app.run(debug=True)
=======
    app.run(debug=True)
>>>>>>> 677ae04b7af11208e1c626c5a430817c9701fc4f
