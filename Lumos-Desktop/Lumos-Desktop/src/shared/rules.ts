import type { Agendamento, Servico } from './types'

/** Grade da barbearia: terça a sábado, blocos de 40 min, dos 09:00 às 17:40.
 *  As regras são as MESMAS do site Flask (output/Lumos-Barbearia/lumos/agenda.py),
 *  mas a numeração de dias aqui é a do JS: getDay() = 0 domingo ... 6 sábado.
 *  No Python o dia aberto é {1..5} (segunda=0); aqui é {2..6}. */
export const SLOTS = [
  '09:00', '09:40', '10:20', '11:00', '11:40',
  '12:20', '13:00', '13:40', '14:20', '15:00',
  '15:40', '16:20', '17:00', '17:40'
]
export const DIAS_ABERTOS = [2, 3, 4, 5, 6]
export const HORIZONTE_MAX_DIAS = 60
export const DIA_FECHADO_MSG = (d: number) => `${NOMES_DIAS[d].replace(/^\w/, c => c.toUpperCase())} a barbearia está fechada. Funcionamos de terça a sábado.`
export const NOMES_DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']
export const NOMES_DIAS_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']

/** Data no fuso da máquina, sem o desvio de 1 dia que toISOString() causa fora de UTC. */
export const paraIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const hoje = (): string => paraIso(new Date())

export const diaDaSemana = (iso: string): number => new Date(`${iso}T12:00:00`).getDay()

export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + dias)
  return paraIso(d)
}

export function semanaDe(iso: string): string[] {
  const d = new Date(`${iso}T12:00:00`)
  // semana comecando na terca (primeiro dia aberto) mais proxima <= data
  let inicio = somarDias(iso, -((d.getDay() + 5) % 7))
  const dias: string[] = []
  for (let i = 0; i < 7 && dias.length < 6; i++) {
    const cand = somarDias(inicio, i)
    if (DIAS_ABERTOS.includes(diaDaSemana(cand))) dias.push(cand)
  }
  return dias.length ? dias : [inicio]
}

export function validarData(iso: string): string | null {
  if (!iso) return 'Escolha uma data.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(`${iso}T12:00:00`))) return 'Data invalida.'
  if (iso < hoje()) return 'Não é possível agendar para datas passadas.'
  if (iso > somarDias(hoje(), HORIZONTE_MAX_DIAS)) return `Agendamentos até ${HORIZONTE_MAX_DIAS} dias à frente.`
  if (!DIAS_ABERTOS.includes(diaDaSemana(iso)))
    return DIA_FECHADO_MSG(diaDaSemana(iso))
  return null
}

export function agoraHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function slotJaPassou(data: string, horario: string): boolean {
  return data === hoje() && horario <= agoraHHMM()
}

/** Conflito de horario: um slot ocupado por agendamento ativo (regra igual ao UNIQUE do site). */
export function slotOcupado(agendamentos: Agendamento[], data: string, horario: string, ignoreId?: string): Agendamento | undefined {
  return agendamentos.find(
    a => a.data === data && a.horario === horario && a.id !== ignoreId &&
      (a.status === 'pendente' || a.status === 'confirmado')
  )
}

export function slotsLivres(agendamentos: Agendamento[], data: string, ignoreId?: string): string[] {
  return SLOTS.filter(h => !slotOcupado(agendamentos, data, h, ignoreId) && !slotJaPassou(data, h))
}

export function validarTelefone(txt: string): { valor: string | null; erro: string | null } {
  const digitos = (txt || '').replace(/\D/g, '')
  if (!digitos) return { valor: null, erro: 'Informe o telefone.' }
  if (digitos.length < 10 || digitos.length > 13) return { valor: null, erro: 'Telefone valido com DDD (10 a 13 digitos).' }
  return { valor: digitos, erro: null }
}

export function formatarTelefone(digitos: string): string {
  const d = (digitos || '').replace(/\D/g, '')
  if (d.length === 12) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  return d
}

export function moeda(centavos: number): string {
  const reais = Math.trunc(centavos / 100), c = Math.abs(centavos % 100)
  return `R$ ${reais.toLocaleString('pt-BR')},${String(c).padStart(2, '0')}`
}

export function dataExtenso(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return `${NOMES_DIAS_CURTO[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function duracaoServico(servico: Servico | undefined): number {
  return servico?.duracao_min ?? 40
}

/** Quantos slots de 40 min o serviço ocupa (Combo de 60 min => 2 slots). */
export function slotsNecessarios(servico: Servico | undefined): number {
  return Math.max(1, Math.ceil(duracaoServico(servico) / 40))
}

export interface ErroAgendamento {
  campo: 'data' | 'horario' | 'servico' | 'cliente' | 'conflito'
  mensagem: string
}

/** Validação completa (mesmas regras do servidor Flask, agora no app). */
export function validarNovoAgendamento(
  entrada: { data: string; horario: string; servico_id: string; cliente_id: string },
  agendamentos: Agendamento[],
  servicos: Servico[]
): ErroAgendamento[] {
  const erros: ErroAgendamento[] = []
  const erroData = validarData(entrada.data)
  if (erroData) return [{ campo: 'data', mensagem: erroData }]
  if (slotJaPassou(entrada.data, entrada.horario))
    erros.push({ campo: 'horario', mensagem: 'Esse horário já passou. Escolha um próximo.' })
  const servico = servicos.find(s => s.id === entrada.servico_id && s.ativo)
  if (!servico) erros.push({ campo: 'servico', mensagem: 'Escolha um serviço.' })
  if (!entrada.cliente_id) erros.push({ campo: 'cliente', mensagem: 'Escolha um cliente.' })
  if (!erros.length) {
    const n = slotsNecessarios(servico)
    for (let i = 0; i < n; i++) {
      const idx = SLOTS.indexOf(entrada.horario) + i
      if (idx >= SLOTS.length) {
        erros.push({ campo: 'conflito', mensagem: 'Sem slots livres suficientes na agenda do dia para esse serviço.' })
        break
      }
      const ocupado = slotOcupado(agendamentos, entrada.data, SLOTS[idx])
      if (ocupado) {
        erros.push({ campo: 'conflito', mensagem: `O horário ${SLOTS[idx]} já está reservado.` })
        break
      }
    }
  }
  return erros
}

export function proximoAgendamento(agendamentos: Agendamento[], aPartirDe: string = hoje()): Agendamento | undefined {
  return [...agendamentos]
    .filter(a => a.data >= aPartirDe && (a.status === 'pendente' || a.status === 'confirmado'))
    .sort((x, y) => (x.data + x.horario).localeCompare(y.data + y.horario))[0]
}

export function faturamentoPrevisto(agendamentos: Agendamento[], servicos: Servico[], desde: string, ate: string): number {
  return agendamentos
    .filter(a => a.data >= desde && a.data <= ate && a.status !== 'faltou')
    .reduce((soma, a) => soma + (servicos.find(s => s.id === a.servico_id)?.preco_centavos ?? 0), 0)
}

export function taxaOcupacao(agendamentos: Agendamento[], data: string): number {
  const ativos = agendamentos.filter(a => a.data === data && (a.status === 'pendente' || a.status === 'confirmado' || a.status === 'concluido'))
  return Math.min(100, Math.round((ativos.length / SLOTS.length) * 100))
}

/** Soma minutos a um "HH:MM" da grade. */
export function somaMinutos(hhmm: string, minutos: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + minutos
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Quantos blocos de 40 min o serviço precisa a partir do horário escolhido,
 *  e se cabem na grade do dia sem invadir horário tomado. */
export function cabeServico(agendamentos: Agendamento[], data: string, horario: string, servico: Servico | undefined, ignoreId?: string): { ok: boolean; motivo?: string } {
  const n = slotsNecessarios(servico)
  const idx = SLOTS.indexOf(horario)
  if (idx < 0) return { ok: false, motivo: 'Horário fora da grade.' }
  for (let k = 0; k < n; k++) {
    const alvo = SLOTS[idx + k]
    if (!alvo) return { ok: false, motivo: 'O serviço não cabe até o fim do expediente.' }
    if (slotOcupado(agendamentos, data, alvo, ignoreId))
      return { ok: false, motivo: `O bloco ${alvo} já está reservado.` }
  }
  return { ok: true }
}
