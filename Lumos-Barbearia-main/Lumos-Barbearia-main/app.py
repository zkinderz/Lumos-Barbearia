from flask import Flask, render_template, request, redirect, url_for, flash, session
import sqlite3
from datetime import date

app = Flask(__name__)
app.secret_key = 'sua_chave_secreta_aqui'

def conectar_bd():
    conn = sqlite3.connect('barbearia.db')
    conn.row_factory = sqlite3.Row
    return conn

# Horários padrão da barbearia
HORARIOS_FUNCIONAMENTO = [
    '09:00', '09:40', '10:20', '11:00', '11:40', 
    '12:20', '13:00', '13:40', '14:20', '15:00', 
    '15:40', '16:20', '17:00', '17:40'
]

def obter_horarios_disponiveis(data):
    conn = conectar_bd()
    cursor = conn.cursor()
    cursor.execute("SELECT horario FROM agendamentos WHERE data = ?", (data,))
    agendados = [row['horario'] for row in cursor.fetchall()]
    conn.close()
    
    # Retorna apenas os horários que ainda não foram agendados
    return [h for h in HORARIOS_FUNCIONAMENTO if h not in agendados]

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/agendar', methods=['GET', 'POST'])
def agendar():
    hoje = date.today().isoformat()
    data_str = request.args.get('data')
    horarios_disponiveis = []

    if data_str:
        # Bloqueia se tentar buscar horários para uma data passada
        if data_str < hoje:
            flash('Não é possível agendar para datas passadas!')
            return redirect(url_for('agendar'))
        
        horarios_disponiveis = obter_horarios_disponiveis(data_str)

    if request.method == 'POST':
        nome = request.form.get('nome')
        telefone = request.form.get('telefone')
        horario = request.form.get('horario')
        data = request.form.get('data')

        # Validação de segurança no envio do formulário
        if data < hoje:
            flash('Não é possível agendar para datas passadas!')
            return redirect(url_for('agendar'))

        conn = conectar_bd()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO agendamentos (nome, telefone, data, horario, confirmado) VALUES (?, ?, ?, ?, 0)",
            (nome, telefone, data, horario)
        )
        conn.commit()
        conn.close()

        flash('Agendamento realizado com sucesso!')
        return redirect(url_for('meus_agendamentos'))

    return render_template('agendar.html', horarios=horarios_disponiveis, data_hoje=hoje)

@app.route('/meus_agendamentos', methods=['GET', 'POST'])
def meus_agendamentos():
    agendamentos = []
    telefone = None

    if request.method == 'POST':
        telefone = request.form.get('telefone')
        conn = conectar_bd()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM agendamentos WHERE telefone = ? ORDER BY data DESC", (telefone,))
        agendamentos = cursor.fetchall()
        conn.close()

    return render_template('meus_agendamentos.html', agendamentos=agendamentos, telefone=telefone)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        senha = request.form.get('senha')
        if senha == 'admin':  # Altere para a senha de sua preferência
            session['admin'] = True
            return redirect(url_for('admin'))
        else:
            flash('Senha incorreta!')

    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('admin', None)
    return redirect(url_for('login'))

@app.route('/admin', methods=['GET'])
def admin():
    if not session.get('admin'):
        return redirect(url_for('login'))

    data = request.args.get('data')
    agendamentos = []

    if data:
        conn = conectar_bd()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM agendamentos WHERE data = ? ORDER BY horario ASC", (data,))
        agendamentos = cursor.fetchall()
        conn.close()

    return render_template('admin.html', agendamentos=agendamentos)

@app.route('/confirmar/<int:id>')
def confirmar(id):
    conn = conectar_bd()
    cursor = conn.cursor()
    cursor.execute("UPDATE agendamentos SET confirmado = 1 WHERE id = ?", (id,))
    conn.commit()
    conn.close()

    if session.get('admin'):
        return redirect(request.referrer or url_for('admin'))
    return redirect(url_for('meus_agendamentos'))

@app.route('/cancelar/<int:id>')
def cancelar(id):
    if not session.get('admin'):
        return redirect(url_for('login'))

    conn = conectar_bd()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM agendamentos WHERE id = ?", (id,))
    conn.commit()
    conn.close()

    return redirect(request.referrer or url_for('admin'))

if __name__ == '__main__':
    app.run(debug=True)