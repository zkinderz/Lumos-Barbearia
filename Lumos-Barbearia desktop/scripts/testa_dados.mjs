/** Testa a camada de dados sem depender de um Supabase real: um PostgREST
 *  falso (fetch stubado) mostra se as requisições saem certas, e o arquivo
 *  local é exercitado de verdade em /tmp.
 *
 *  npm run test:dados    (rodar depois de npm run test:regras, que gera dist-test/) */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const dados = require(path.join(process.cwd(), 'dist-test', 'dados.cjs'))

let falhas = 0
const caso = async (nome, fn) => {
  try { await fn(); console.log('  ok   ' + nome) }
  catch (e) { console.log('  XX   ' + nome + '\n       ' + (e.message ?? e)); falhas++ }
}

/* ---------------------------------------------------------- linhas fake --- */
const LINHA = {
  clientes: () => ({ id: 'c1', nome: 'Ana', telefone: '11900000000', email: null, obs: null, aceite_lgpd_versao: null, criado_em: '2026-01-01T00:00:00Z' }),
  servicos: () => ({ id: 's1', nome: 'Corte', descricao: '', preco_centavos: 4500, duracao_min: 40, ativo: true, ordem: 0 }),
  agendamentos: () => ({ id: 'a1', cliente_id: 'c1', servico_id: 's1', data: '2030-01-03', horario: '10:20', status: 'pendente', origem: 'desktop', obs: null, criado_em: '' }),
  config_loja: () => ({ chave: 'nome', valor: 'Lumos Teste' })
}

/* ------------------------------------------------------- POSTGREST FALSO -- */
const banco = { clientes: [], servico: [], servicos: [], agendamentos: [], config_loja: [] }
const chamado = []
let scenario = 'ok'

globalThis.fetch = async (url, opcoes = {}) => {
  const u = new URL(url)
  const tabela = u.pathname.replace('/rest/v1/', '')
  const metodo = opcoes.method ?? 'GET'
  const corpo = opcoes.body ? JSON.parse(opcoes.body) : null
  chamado.push({ tabela, metodo, corpo, filtros: Object.fromEntries(u.searchParams), headers: opcoes.headers })

  if (scenario === 'offline') throw new TypeError('fetch failed')
  if (scenario === 'negado' && metodo !== 'GET') {
    return new Response('{"message":"new row violates row-level security policy for table"}', { status: 403 })
  }
  if (scenario === 'conflito' && metodo === 'POST' && tabela === 'agendamentos') {
    return new Response('{"code":"23505","message":"duplicate key value violates unique constraint \\"agendamentos_data_horario_key\\""}', { status: 409 })
  }
  if (metodo === 'POST' || metodo === 'PATCH') {
    const linhas = (Array.isArray(corpo) ? corpo : [corpo]).map(c => ({ ...(LINHA[tabela]?.() ?? {}), ...c }))
    return new Response(JSON.stringify(linhas), { status: 201 })
  }
  if (metodo === 'DELETE') return new Response(null, { status: 204 })
  return new Response(JSON.stringify(banco[tabela] ?? []), { status: 200 })
}

const cfg = { modo: 'supabase', url: 'https://projeto.supabase.co', chave: 'chave-de-teste', namespace: 'public' }
const repo = dados.criarRepositorioSupabase(cfg)

console.log('\n[leitura do Supabase]')
await caso('snapshot lê clientes, servicos, agendamentos e config_loja', async () => {
  banco.clientes = [LINHA.clientes()]; banco.servicos = [LINHA.servicos()]
  banco.agendamentos = []; banco.config_loja = [{ chave: 'nome', valor: 'Lumos Teste' }, { chave: 'comissao_pct', valor: 40 }]
  chamado.length = 0
  const s = await repo.snapshot()
  assert.equal(s.config.nome, 'Lumos Teste')
  assert.equal(s.config.comissao_pct, 40)
  assert.equal(s.clientes.length, 1)
  assert.deepEqual([...new Set(chamado.map(c => c.tabela))].sort(), ['agendamentos', 'clientes', 'config_loja', 'servicos'])
})

await caso('toda requisição leva apikey + Bearer', async () => {
  await repo.snapshot()
  for (const c of chamado) {
    assert.equal(c.headers.apikey, 'chave-de-teste', `apikey faltando em ${c.tabela}`)
    assert.equal(c.headers.Authorization, 'Bearer chave-de-teste')
  }
})

console.log('\n[escrita no Supabase]')
await caso('criar agendamento manda POST com status pendente e obs limpa', async () => {
  chamado.length = 0
  const r = await repo.criarAgendamento({ cliente_id: 'c1', servico_id: 's1', data: '2030-01-03', horario: '10:20', obs: '  degradê  ' })
  assert.ok(r.ok, r.erro)
  const p = chamado.find(c => c.tabela === 'agendamentos' && c.metodo === 'POST')
  assert.equal(p.corpo[0].obs, 'degradê')
  assert.equal(p.corpo[0].status, 'pendente')
  assert.equal(p.corpo[0].origem, 'desktop')
  assert.deepEqual(Object.keys(p.corpo[0]).sort(), ['cliente_id', 'data', 'horario', 'obs', 'origem', 'servico_id', 'status'])
})

await caso('mesmo horário no banco (23505) vira aviso legível, não stack', async () => {
  scenario = 'conflito'
  const r = await repo.criarAgendamento({ cliente_id: 'c1', servico_id: 's1', data: '2030-01-03', horario: '10:20' })
  scenario = 'ok'
  assert.ok(!r.ok)
  assert.match(r.erro, /outro dispositivo/)
})

await caso('RLS bloqueando escrita aparece como erro de acesso', async () => {
  scenario = 'negado'
  const r = await repo.salvarCliente({ nome: 'Novo', telefone: '11988887777', email: '' })
  scenario = 'ok'
  assert.ok(!r.ok)
  assert.match(r.erro, /row-level security|políticas de linha/i)
})

await caso('rede caída não quebra a tela: devolve erro amigável', async () => {
  scenario = 'offline'
  const r = await repo.criarAgendamento({ cliente_id: 'c1', servico_id: 's1', data: '2030-01-03', horario: '11:00' })
  scenario = 'ok'
  assert.ok(!r.ok)
  assert.match(r.erro, /Sem conexão/)
})

await caso('remarcar faz PATCH em id=eq, sem apagar e recriar', async () => {
  chamado.length = 0
  const r = await repo.remarcarAgendamento('a1', '2030-01-03', '13:40')
  assert.ok(r.ok, r.erro)
  const p = chamado.find(c => c.metodo === 'PATCH')
  assert.equal(p.filtros.id, 'eq.a1')
  assert.equal(p.corpo.horario, '13:40')
})

await caso('excluir cliente: libera futuros, anonimiza histórico, apaga cadastro', async () => {
  chamado.length = 0
  const amanha = new Date(Date.now() + 864e5)
  const isoAmanha = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, '0')}-${String(amanha.getDate()).padStart(2, '0')}`
  banco.agendamentos = [
    { ...LINHA.agendamentos(), id: 'futuro', data: isoAmanha },
    { ...LINHA.agendamentos(), id: 'passado', data: '2020-01-03', status: 'concluido' }
  ]
  const hojeIso = isoAmanha
  const r = await repo.excluirCliente('c1')
  assert.ok(r.ok, r.erro)
  const busca = chamado.find(c => c.tabela === 'agendamentos' && c.metodo === 'GET')
  assert.ok(busca.filtros.data.startsWith(`gte.${hojeIso.slice(0, 4)}`), 'só busca datas de hoje em diante')
  assert.ok(chamado.some(c => c.metodo === 'DELETE' && c.tabela === 'agendamentos'), 'cancela os horários futuros')
  const anon = chamado.find(c => c.metodo === 'PATCH' && c.tabela === 'agendamentos')
  assert.equal(anon.corpo.cliente_id, null, 'histórico fica sem o vínculo do cliente')
  assert.ok(chamado.some(c => c.metodo === 'DELETE' && c.tabela === 'clientes'), 'apaga o cadastro')
})

await caso('dados da loja sobem como upsert merge-duplicates', async () => {
  chamado.length = 0
  const r = await repo.salvarConfig({ nome: 'Lumos', endereco: 'Rua X', whatsapp: '5511', comissao_pct: 40 })
  assert.ok(r.ok, r.erro)
  const p = chamado.find(c => c.tabela === 'config_loja')
  assert.equal(p.filtros.on_conflict, 'chave')
  assert.equal(p.corpo.find(l => l.chave === 'comissao_pct').valor, 40)
})

console.log('\n[arquivo local do desktop]')
await caso('grava e relê o JSON do disco', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumos-'))
  const caminho = path.join(dir, 'lumos-dados.json')
  const r = dados.criarRepositorioLocal(dados.criarAdaptadorArquivo(caminho))
  const criado = await r.salvarCliente({ nome: 'Maria', telefone: '11977776666', email: '' })
  assert.ok(criado.ok, criado.erro)
  assert.ok(fs.existsSync(caminho))
  const reaberto = await dados.criarRepositorioLocal(dados.criarAdaptadorArquivo(caminho)).snapshot()
  assert.equal(reaberto.clientes[0].nome, 'Maria')
  assert.ok(reaberto.servicos.length >= 1, 'cardápio volta semeado')
})

await caso('JSON corrompido não derruba o app (e vira evidência)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumos-'))
  const caminho = path.join(dir, 'lumos-dados.json')
  fs.writeFileSync(caminho, '{"clientes": [QUEBRADO', 'utf-8')
  const r = dados.criarRepositorioLocal(dados.criarAdaptadorArquivo(caminho))
  const s = await r.snapshot()
  assert.deepEqual(s.clientes, [])
  assert.ok(fs.readdirSync(dir).some(f => f.includes('.corrompido')), 'arquivo quebrado é preservado')
})

await caso('cópia de segurança cria backup datado', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumos-'))
  const caminho = path.join(dir, 'lumos-dados.json')
  await dados.criarRepositorioLocal(dados.criarAdaptadorArquivo(caminho)).salvarCliente({ nome: 'Beta', telefone: '11966665555', email: '' })
  const feito = dados.copiaSeguranca(caminho)
  assert.ok(feito && fs.existsSync(feito))
  assert.match(path.basename(feito), /^lumos-dados-\d{4}-\d{2}-\d{2}\.json$/)
})

await caso('repositório local também recusa o mesmo bloco duas vezes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumos-'))
  const r = dados.criarRepositorioLocal(dados.criarAdaptadorArquivo(path.join(dir, 'x.json')))
  await r.salvarCliente({ nome: 'Ana', telefone: '11911112222', email: '' })
  const s0 = await r.snapshot()
  const dia = (() => { const d = new Date(); do { d.setDate(d.getDate() + 1) } while (![2, 3, 4, 5, 6].includes(d.getDay())); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const primeiro = await r.criarAgendamento({ cliente_id: s0.clientes[0].id, servico_id: s0.servicos[0].id, data: dia, horario: '09:00' })
  const segundo = await r.criarAgendamento({ cliente_id: s0.clientes[0].id, servico_id: s0.servicos[0].id, data: dia, horario: '09:00' })
  assert.ok(primeiro.ok, primeiro.erro)
  assert.ok(!segundo.ok && /já está reservado/.test(segundo.erro), JSON.stringify(segundo.erro))
})

console.log(falhas ? `\nFALHOU ${falhas} caso(s)\n` : '\ncamada de dados ok\n')
process.exit(falhas ? 1 : 0)
