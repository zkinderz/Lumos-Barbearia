/** Testa o núcleo de regra compartilhado (src/shared) sem subir interface.
 *  node scripts/testa_regras.mjs   (roda depois do build: usa dist-test/rules.mjs) */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const pacote = require(path.join(raiz, 'dist-test', 'pacote.cjs'))
const { regras, memoria } = pacote

let falhas = 0
function caso(nome, cond) {
  const passou = !!cond
  console.log(`${passou ? '  ok  ' : '  XX  '} ${nome}`)
  if (!passou) falhas++
}
const snapshotBase = (agendamentos = [], clientes = []) => ({
  clientes, servicos: [
    { id: 'c40', nome: 'Corte', descricao: '', preco_centavos: 4500, duracao_min: 40, ativo: true },
    { id: 's60', nome: 'Combo', descricao: '', preco_centavos: 7000, duracao_min: 60, ativo: true }
  ], agendamentos, config: { nome: 'Lumos', endereco: '', whatsapp: '', comissao_pct: 30 }
})
const diaAberto = (n) => {
  let d = new Date(); d.setDate(d.getDate() + n)
  while (!regras.DIAS_ABERTOS.includes(d.getDay())) d.setDate(d.getDate() + 1)
 return regras.paraIso(d)
}
const diaFechado = (alvo) => {
  let d = new Date(); d.setDate(d.getDate() + 2)
  while (d.getDay() !== alvo) d.setDate(d.getDate() + 1)
  return regras.paraIso(d)
}
const cliente = { id: 'c1', nome: 'Joao', telefone: '11977776666', email: '', criado_em: '' }
const reserva = (data, horario, extra = {}) => ({
  id: extra.id ?? 'a1', cliente_id: 'c1', servico_id: extra.servico_id ?? 'c40',
  data, horario, status: 'pendente', origem: 'desktop', criado_em: '', ...extra
})

console.log('\n[datas]')
caso('segunda é dia fechado', /fechada/.test(regras.validarData(diaFechado(1)) ?? ''))
caso('domingo é dia fechado', /fechada/.test(regras.validarData(diaFechado(0)) ?? ''))
caso('data passada recusada', !!regras.validarData('2020-05-05'))
caso('longe demais recusada', !!regras.validarData('2999-01-05'))
caso('dia aberto aceito', regras.validarData(diaAberto(3)) === null)

console.log('\n[slot ocupado / conflito]')
const dia = diaAberto(4)
let estado = memoria.criarAgendamento(snapshotBase([], [cliente]), { cliente_id: 'c1', servico_id: 'c40', data: dia, horario: '10:20' })
caso('primeira reserva passa', estado.resultado.ok)
const duasVezes = memoria.criarAgendamento(estado.snapshot, { cliente_id: 'c1', servico_id: 'c40', data: dia, horario: '10:20' })
caso('mesmo bloco recusado', !duasVezes.resultado.ok && /10:20/.test(duasVezes.resultado.erro))
caso('estado não mudou na recusa', duasVezes.snapshot.agendamentos.length === 1)

console.log('\n[duração do serviço]')
const combo = memoria.criarAgendamento(snapshotBase([reserva(dia, '11:00')], [cliente]), { cliente_id: 'c1', servico_id: 's60', data: dia, horario: '10:20' })
caso('combo de 60 min não cabe quando o próximo bloco está tomado', !combo.resultado.ok)
const ok60 = memoria.criarAgendamento(snapshotBase([], [cliente]), { cliente_id: 'c1', servico_id: 's60', data: dia, horario: '13:00' })
caso('combo de 60 min cabe em duas vagas seguidas', ok60.resultado.ok)

console.log('\n[slots livres e ocupação]')
const comUm = snapshotBase([reserva(dia, '09:00'), reserva(dia, '09:40', { id: 'a2', status: 'confirmado' })], [cliente])
caso('slots tomados saem da lista', !regras.slotsLivres(comUm.agendamentos, dia).includes('09:00'))
caso('slot de outro dia não influencia', regras.slotsLivres(comUm.agendamentos, diaAberto(9)).includes('09:00'))
caso('ocupação calculada', regras.taxaOcupacao(comUm.agendamentos, dia) === Math.round((2 / regras.SLOTS.length) * 100))

console.log('\n[LGPD: excluir cliente]')
const comFuturo = snapshotBase([reserva(dia, '11:40'), reserva(diaAberto(11), '09:00', { id: 'a2' })], [cliente])
const excluido = memoria.excluirCliente(comFuturo, 'c1')
caso('exclusão confirmada', excluido.resultado.ok)
caso('sumiu o cliente', !excluido.snapshot.clientes.some(c => c.id === 'c1'))
caso('horários futuros cancelados (liberam o bloco)', !excluido.snapshot.agendamentos.some(a => a.data >= regras.hoje() && a.cliente_id === 'c1'))
caso('avisou quantos cancelou', excluido.resultado.dados.cancelados >= 1)

console.log('\n[validação de cliente e telefone]')
caso('telefone curto recusado', memoria.salvarCliente(snapshotBase(), { nome: 'Teste', telefone: '11999', email: '' }).resultado.ok === false)
caso('nome curto recusado', memoria.salvarCliente(snapshotBase(), { nome: 'J', telefone: '11977776666', email: '' }).resultado.ok === false)
caso('telefone duplicado recusado', memoria.salvarCliente(snapshotBase([], [cliente]), { nome: 'Outro', telefone: '11977776666', email: '' }).resultado.ok === false)

console.log('\n[moeda e horário]')
caso('centavos viram R\$ brasileiro', regras.moeda(4500).replace(/\u00a0/g, ' ').includes('45,00'))
caso('somar 40 minutos', regras.somaMinutos('10:20', 40) === '11:00')

console.log(falhas ? `\nFALHOU ${falhas} caso(s)\n` : '\ntodas as regras do app passaram\n')
process.exit(falhas ? 1 : 0)
