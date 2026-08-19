import sqlite3
from datetime import datetime, date
from flask import Flask, render_template, request, redirect, url_for, flash, session

app = Flask(__name__)
app.secret_key = 'sua_chave_secreta_lumos_barbearia'

# -----------------------------------------------------------------------------
# BANCO DE DADOS (COM COLUNA SERVICO E MIGRACAO AUTOMATICA)
# -----------------------------------------------------------------------------
def conectar_bd():
    conn = sqlite3.connect('barbearia.db')
    conn.row_factory = sqlite3.Row
    return conn

def inicializar_banco():
    conn = conectar_bd()
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            telefone TEXT NOT NULL,
            senha TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            aceito_lgpd INTEGER DEFAULT 0,
            data_aceite_lgpd TEXT
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS agendamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            nome TEXT NOT NULL,
            telefone TEXT NOT NULL,
            servico TEXT NOT NULL DEFAULT 'Corte Moderno',
            data TEXT NOT NULL,
            horario TEXT NOT NULL,
            confirmado INTEGER DEFAULT 0,
            FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        )
    ''')

    # Migração simples caso a tabela já existisse sem a coluna servico
    cursor.execute("PRAGMA table_info(agendamentos)")
    colunas = [coluna[1] for coluna in cursor.fetchall()]
    if 'servico' not in colunas:
        cursor.execute("ALTER TABLE agendamentos ADD COLUMN servico TEXT DEFAULT 'Corte Moderno'")

    cursor.execute("SELECT * FROM usuarios WHERE email = 'admin'")
    if not cursor.fetchone():
        data_atual = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute('''
            INSERT INTO usuarios (nome, email, telefone, senha, is_admin, aceito_lgpd, data_aceite_lgpd)
            VALUES (?, ?, ?, ?, 1, 1, ?)
        ''', ('Administrador', 'admin', '00000000000', 'admin', data_atual))

    conn.commit()
    conn.close()

inicializar_banco()

HORARIOS_FUNCIONAMENTO = [
    '09:00', '09:40', '10:20', '11:00', '11:40', 
    '12:20', '13:00', '13:40', '14:20', '15:00', 
    '15:40', '16:20', '17:00', '17:40'
]

def obter_horarios_disponiveis(data_selecionada):
    conn = conectar_bd()
    cursor = conn.cursor()
    cursor.execute("SELECT horario FROM agendamentos WHERE data = ?", (data_selecionada,))
    agendados = [row['horario'] for row in cursor.fetchall()]
    conn.close()
    return [h for h in HORARIOS_FUNCIONAMENTO if h not in agendados]

# -----------------------------------------------------------------------------
# ROTAS PRINCIPAIS
# -----------------------------------------------------------------------------
@app.route('/')
def index():
    # Qualquer usuário pode acessar o site livremente
    return render_template('index.html')

@app.route('/agendar', methods=['GET', 'POST'])
def agendar():
    hoje = date.today().isoformat()
    data_str = request.args.get('data')
    horarios_disponiveis = []

    if data_str:
        if data_str < hoje:
            flash('Não é possível agendar para datas passadas!')
            return redirect(url_for('agendar'))
        horarios_disponiveis = obter_horarios_disponiveis(data_str)

    if request.method == 'POST':
        # Se tentar confirmar e NÃO estiver logado, guarda a intenção e redireciona para login
        if 'usuario_id' not in session:
            session['agendamento_pendente'] = {
                'data': request.form.get('data'),
                'horario': request.form.get('horario'),
                'servico': request.form.get('servico')
            }
            flash('Para concluir o agendamento, faça login ou cadastre-se!')
            return redirect(url_for('login'))

        # Se já estiver logado, processa direto
        data_selecionada = request.form.get('data')
        horario_selecionado = request.form.get('horario')
        servico_selecionado = request.form.get('servico')

        conn = conectar_bd()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO agendamentos (usuario_id, nome, telefone, servico, data, horario, confirmado) VALUES (?, ?, ?, ?, ?, ?, 0)",
            (session['usuario_id'], session['usuario_nome'], session.get('usuario_telefone', ''), servico_selecionado, data_selecionada, horario_selecionado)
        )
        conn.commit()
        conn.close()

        flash('Agendamento realizado com sucesso!')
        return redirect(url_for('meus_agendamentos'))

    return render_template('agendar.html', horarios=horarios_disponiveis, data_hoje=hoje, data_selecionada=data_str)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email')
        senha = request.form.get('senha')

        conn = conectar_bd()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM usuarios WHERE email = ? AND senha = ?", (email, senha))
        usuario = cursor.fetchone()
        conn.close()

        if usuario:
            session['usuario_id'] = usuario['id']
            session['usuario_nome'] = usuario['nome']
            session['usuario_telefone'] = usuario['telefone']
            session['is_admin'] = bool(usuario['is_admin'])

            flash(f'Bem-vindo, {usuario["nome"]}!')

            # Se havia um agendamento pendente antes do login, salva-o automaticamente agora
            if 'agendamento_pendente' in session:
                p = session.pop('agendamento_pendente')
                conn = conectar_bd()
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO agendamentos (usuario_id, nome, telefone, servico, data, horario, confirmado) VALUES (?, ?, ?, ?, ?, ?, 0)",
                    (usuario['id'], usuario['nome'], usuario['telefone'], p['servico'], p['data'], p['horario'])
                )
                conn.commit()
                conn.close()
                flash('Agendamento concluído com sucesso!')
                return redirect(url_for('meus_agendamentos'))

            if usuario['is_admin']:
                return redirect(url_for('admin'))
            
            return redirect(url_for('index'))
        else:
            flash('E-mail ou senha incorretos!')

    return render_template('login.html')

@app.route('/cadastro', methods=['GET', 'POST'])
def cadastro():
    if request.method == 'POST':
        nome = request.form.get('nome')
        email = request.form.get('email')
        telefone = request.form.get('telefone')
        senha = request.form.get('senha')
        aceito_lgpd = 1 if request.form.get('lgpd') == 'on' else 0

        if not aceito_lgpd:
            flash('Você precisa aceitar os termos da LGPD para se cadastrar!')
            return redirect(url_for('cadastro'))

        conn = conectar_bd()
        cursor = conn.cursor()
        
        cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
        if cursor.fetchone():
            flash('E-mail já cadastrado! Tente fazer login.')
            conn.close()
            return redirect(url_for('cadastro'))

        data_aceite = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute('''
            INSERT INTO usuarios (nome, email, telefone, senha, is_admin, aceito_lgpd, data_aceite_lgpd)
            VALUES (?, ?, ?, ?, 0, ?, ?)
        ''', (nome, email, telefone, senha, aceito_lgpd, data_aceite))
        
        conn.commit()

        # Faz login automático após cadastrar
        cursor.execute("SELECT * FROM usuarios WHERE email = ?", (email,))
        novo_usuario = cursor.fetchone()
        session['usuario_id'] = novo_usuario['id']
        session['usuario_nome'] = novo_usuario['nome']
        session['usuario_telefone'] = novo_usuario['telefone']
        session['is_admin'] = False
        conn.close()

        # Conclui agendamento se estivesse pendente
        if 'agendamento_pendente' in session:
            p = session.pop('agendamento_pendente')
            conn = conectar_bd()
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO agendamentos (usuario_id, nome, telefone, servico, data, horario, confirmado) VALUES (?, ?, ?, ?, ?, ?, 0)",
                (novo_usuario['id'], novo_usuario['nome'], novo_usuario['telefone'], p['servico'], p['data'], p['horario'])
            )
            conn.commit()
            conn.close()
            flash('Cadastro feito e agendamento concluído com sucesso!')
            return redirect(url_for('meus_agendamentos'))

        flash('Cadastro realizado com sucesso!')
        return redirect(url_for('index'))

    return render_template('cadastro.html')

@app.route('/logout')
def logout():
    session.clear()
    flash('Você saiu do sistema.')
    return redirect(url_for('index'))

@app.route('/meus_agendamentos')
def meus_agendamentos():
    if 'usuario_id' not in session:
        flash('Faça login para visualizar seus agendamentos.')
        return redirect(url_for('login'))

    conn = conectar_bd()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM agendamentos WHERE usuario_id = ? ORDER BY data DESC, horario ASC",
        (session['usuario_id'],)
    )
    agendamentos = cursor.fetchall()
    conn.close()

    return render_template('meus_agendamentos.html', agendamentos=agendamentos)

@app.route('/admin', methods=['GET'])
def admin():
    if not session.get('is_admin'):
        flash('Acesso restrito ao administrador.')
        return redirect(url_for('login'))

    data = request.args.get('data')
    conn = conectar_bd()
    cursor = conn.cursor()

    if data:
        cursor.execute("SELECT * FROM agendamentos WHERE data = ? ORDER BY horario ASC", (data,))
    else:
        cursor.execute("SELECT * FROM agendamentos ORDER BY data DESC, horario ASC")

    agendamentos = cursor.fetchall()
    conn.close()

    return render_template('admin.html', agendamentos=agendamentos)

@app.route('/confirmar/<int:id>')
def confirmar(id):
    if not session.get('is_admin'):
        flash('Acesso negado.')
        return redirect(url_for('login'))

    conn = conectar_bd()
    cursor = conn.cursor()
    cursor.execute("UPDATE agendamentos SET confirmado = 1 WHERE id = ?", (id,))
    conn.commit()
    conn.close()

    return redirect(request.referrer or url_for('admin'))

@app.route('/cancelar/<int:id>')
def cancelar(id):
    if 'usuario_id' not in session:
        return redirect(url_for('login'))

    conn = conectar_bd()
    cursor = conn.cursor()

    if session.get('is_admin'):
        cursor.execute("DELETE FROM agendamentos WHERE id = ?", (id,))
    else:
        cursor.execute("DELETE FROM agendamentos WHERE id = ? AND usuario_id = ?", (id, session['usuario_id']))

    conn.commit()
    conn.close()

    flash('Agendamento cancelado com sucesso.')
    return redirect(request.referrer or url_for('meus_agendamentos'))

if __name__ == '__main__':
    app.run(debug=True)