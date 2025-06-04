<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin - Lumos Barbearia</title>
    <link rel="stylesheet" href="{{ url_for('static', filename='css/style.css') }}">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
</head>
<body>
    <div class="container">
        <h2>Área do Administrador</h2>
        <form method="get">
            <label>Data (DD/MM/AAAA):</label>
            <input type="text" name="data" required>
            <input type="submit" value="Ver Agendamentos">
        </form>
        {% if agendamentos %}
            <h3>Agendamentos:</h3>
            <ul>
            {% for a in agendamentos %}
                <li>{{a['horario']}} - {{a['nome']}} ({{a['telefone']}}) - {% if a['confirmado'] %}Confirmado{% else %}Pendente{% endif %}</li>
            {% endfor %}
            </ul>
        {% endif %}
        <a href="/" class="btn-link" style="margin-top: 20px;">Voltar à Página Inicial</a>
    </div>
</body>
</html>