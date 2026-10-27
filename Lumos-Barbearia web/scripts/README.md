# Scripts e testes

- `python -m unittest discover -s tests -v` — 27 testes de regra de negócio em
  `tests/test_fluxos.py`: hash de senha, ausência de admin padrão, CSRF,
  bloqueio de força bruta, anti-conflito de horário, validação de data/dia/slot/
  serviço/telefone, permissões de cliente vs. admin, telas LGPD (consentimento,
  exportar, excluir) e o fluxo "escolhi horário sem conta → fiz login → a reserva
  sobreviveu ao aceite da política".

- `python scripts/verificar_projeto.py` — 62 checagens de consistência: nenhum
  `<style>` inline sobrando, nenhum `url_for` para rota inexistente, classes do
  HTML presentes no CSS, rotas públicas respondendo, rotas privadas barrando
  anônimo, encoding UTF-8 correto e nenhum placeholder esquecido no código.

- `python scripts/gerar_dados_demo.py` — cria dois clientes e três reservas
  fictícias (senha de teste: `senha-forte-123`) para você clicar pelo site sem
  cadastrar na mão. Para limpar depois, apague a pasta `data/`.
