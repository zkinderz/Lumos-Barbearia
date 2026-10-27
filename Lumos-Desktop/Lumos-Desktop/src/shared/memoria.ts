import type { Agendamento, Cliente, ConfigLoja, Servico, Snapshot } from './types'
import { slotOcupado, validarData, slotJaPassou, hoje, cabeServico } from './rules'
import type { Resultado } from './repositorio'

export const novoId = (prefixo: string): string =>
  `${prefixo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

const ok = <T,>(dados?: T): Resultado<T> => ({ ok: true, dados })
const falha = (erro: string): Resultado<never> => ({ ok: false, erro })

/** Núcleo de regra de negócio, igual para o arquivo local e para o Supabase.
 *  Recebe o estado atual, devolve o estado novo (imutável) e o resultado da operação. */

export function criarAgendamento(
  s: Snapshot, i: { cliente_id: string; servico_id: string; data: string; horario: string; obs?: string; origem?: 'desktop' | 'web' }
): { snapshot: Snapshot; resultado: Resultado<Agendamento> } {
  const erroData = validarData(i.data)
  if (erroData) return { snapshot: s, resultado: falha(erroData) }
  if (slotJaPassou(i.data, i.horario)) return { snapshot: s, resultado: falha(`O horário ${i.horario} de hoje já passou.`) }
  const servico = s.servicos.find(x => x.id === i.servico_id && x.ativo)
  if (!servico) return { snapshot: s, resultado: falha('Escolha um serviço ativo.') }
  const cliente = s.clientes.find(c => c.id === i.cliente_id)
  if (!cliente) return { snapshot: s, resultado: falha('Escolha um cliente cadastrado.') }

  const confere = cabeServico(s.agendamentos, i.data, i.horario, servico)
  if (!confere.ok) {
    const tomado = slotOcupado(s.agendamentos, i.data, i.horario)
    const nome = tomado ? s.clientes.find(c => c.id === tomado.cliente_id)?.nome : undefined
    return { snapshot: s, resultado: falha(nome ? `O horário ${i.horario} já está reservado para ${nome}.` : confere.motivo ?? 'Horário indisponível.') }
  }

  const novo: Agendamento = {
    id: novoId('a'), cliente_id: cliente.id, servico_id: servico.id, data: i.data, horario: i.horario,
    status: 'pendente', origem: i.origem ?? 'desktop', obs: i.obs?.trim() || undefined, criado_em: new Date().toISOString()
  }
  return { snapshot: { ...s, agendamentos: [...s.agendamentos, novo] }, resultado: ok(novo) }
}

export function remarcar(
  s: Snapshot, id: string, data: string, horario: string
): { snapshot: Snapshot; resultado: Resultado<Agendamento> } {
  const alvo = s.agendamentos.find(a => a.id === id)
  if (!alvo) return { snapshot: s, resultado: falha('Agendamento não encontrado.') }
  if (alvo.status === 'concluido') return { snapshot: s, resultado: falha('Agendamento concluído não pode ser remarcado.') }
  const erroData = validarData(data)
  if (erroData) return { snapshot: s, resultado: falha(erroData) }
  const ocupado = slotOcupado(s.agendamentos, data, horario, id)
  if (ocupado) return { snapshot: s, resultado: falha(`O horário ${horario} do dia ${data} já está tomado.`) }
  const atualizado = { ...alvo, data, horario, status: 'pendente' as const }
  return {
    snapshot: { ...s, agendamentos: s.agendamentos.map(a => (a.id === id ? atualizado : a)) },
    resultado: ok(atualizado)
  }
}

export function mudarStatus(
  s: Snapshot, id: string, status: Agendamento['status']
): { snapshot: Snapshot; resultado: Resultado<Agendamento> } {
  const alvo = s.agendamentos.find(a => a.id === id)
  if (!alvo) return { snapshot: s, resultado: falha('Agendamento não encontrado.') }
  if (alvo.data < hoje() && status === 'confirmado') return { snapshot: s, resultado: falha('Não dá para confirmar um horário que já passou — registre como atendido ou falta.') }
  const atualizado = { ...alvo, status }
  return { snapshot: { ...s, agendamentos: s.agendamentos.map(a => (a.id === id ? atualizado : a)) }, resultado: ok(atualizado) }
}

export function removerAgendamento(s: Snapshot, id: string): { snapshot: Snapshot; resultado: Resultado } {
  if (!s.agendamentos.some(a => a.id === id)) return { snapshot: s, resultado: falha('Agendamento não encontrado.') }
  return { snapshot: { ...s, agendamentos: s.agendamentos.filter(a => a.id !== id) }, resultado: ok() }
}

export function salvarCliente(
  s: Snapshot, i: { id?: string; nome: string; telefone: string; email: string; obs?: string }
): { snapshot: Snapshot; resultado: Resultado<Cliente> } {
  const nome = i.nome.trim()
  if (nome.length < 2) return { snapshot: s, resultado: falha('Informe o nome do cliente.') }
  const telefone = (i.telefone || '').replace(/\D/g, '')
  if (telefone.length < 10 || telefone.length > 13) return { snapshot: s, resultado: falha('Telefone com DDD (10 a 13 dígitos).') }
  const email = (i.email || '').trim().toLowerCase()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { snapshot: s, resultado: falha('E-mail inválido.') }
  const duplicado = s.clientes.find(c => c.id !== i.id && c.telefone === telefone)
  if (duplicado) return { snapshot: s, resultado: falha(`Já existe um cliente com esse telefone: ${duplicado.nome}.`) }

  if (i.id) {
    const alvo = s.clientes.find(c => c.id === i.id)
    if (!alvo) return { snapshot: s, resultado: falha('Cliente não encontrado.') }
    const atualizado: Cliente = { ...alvo, nome, telefone, email, obs: i.obs?.trim() || undefined }
    return { snapshot: { ...s, clientes: s.clientes.map(c => (c.id === i.id ? atualizado : c)) }, resultado: ok(atualizado) }
  }
  const novo: Cliente = {
    id: novoId('c'), nome, telefone, email, obs: i.obs?.trim() || undefined,
    aceite_lgpd_versao: 'balcao', origem: 'desktop', criado_em: new Date().toISOString()
  }
  return { snapshot: { ...s, clientes: [...s.clientes, novo] }, resultado: ok(novo) }
}

/** Eliminar (art. 18 LGPD): apaga o cadastro e os horários futuros; o histórico
 *  já passado fica anonimizado por obrigação de guarda fiscal/estatística. */
export function excluirCliente(s: Snapshot, id: string): { snapshot: Snapshot; resultado: Resultado<{ cancelados: number }> } {
  const alvo = s.clientes.find(c => c.id === id)
  if (!alvo) return { snapshot: s, resultado: falha('Cliente não encontrado.') }
  const futuros = s.agendamentos.filter(a => a.cliente_id === id && a.data >= hoje())
  const restantesPassados = s.agendamentos
    .filter(a => a.cliente_id === id && a.data < hoje())
    .map(a => ({ ...a, cliente_id: 'removido', obs: 'cliente removido a pedido' }))
  const outros = s.agendamentos.filter(a => a.cliente_id !== id)
  return {
    snapshot: {
      ...s,
      clientes: s.clientes.filter(c => c.id !== id),
      agendamentos: [...outros, ...restantesPassados]
    },
    resultado: ok({ cancelados: futuros.length })
  }
}

export function exportarCliente(s: Snapshot, id: string): { snapshot: Snapshot; resultado: Resultado<unknown> } {
  const cliente = s.clientes.find(c => c.id === id)
  if (!cliente) return { snapshot: s, resultado: falha('Cliente não encontrado.') }
  const agendamentos = s.agendamentos
    .filter(a => a.cliente_id === id)
    .map(a => ({
      data: a.data, horario: a.horario, status: a.status, origem: a.origem,
      servico: s.servicos.find(x => x.id === a.servico_id)?.nome ?? '—'
    }))
  return { snapshot: s, resultado: ok({ cliente, agendamentos, gerado_em: new Date().toISOString() }) }
}

export function salvarServico(
  s: Snapshot, i: { id?: string; nome: string; descricao: string; preco_centavos: number; duracao_min: number; ativo: boolean }
): { snapshot: Snapshot; resultado: Resultado<Servico> } {
  const nome = i.nome.trim()
  if (nome.length < 2) return { snapshot: s, resultado: falha('Informe o nome do serviço.') }
  if (!Number.isFinite(i.preco_centavos) || i.preco_centavos < 0) return { snapshot: s, resultado: falha('Preço inválido.') }
  if (i.duracao_min < 10 || i.duracao_min > 240) return { snapshot: s, resultado: falha('A duração fica entre 10 e 240 minutos.') }
  if (i.id) {
    const alvo = s.servicos.find(x => x.id === i.id)
    if (!alvo) return { snapshot: s, resultado: falha('Serviço não encontrado.') }
    const atualizado: Servico = { ...alvo, nome, descricao: i.descricao.trim(), preco_centavos: Math.round(i.preco_centavos), duracao_min: i.duracao_min, ativo: i.ativo }
    return { snapshot: { ...s, servicos: s.servicos.map(x => (x.id === i.id ? atualizado : x)) }, resultado: ok(atualizado) }
  }
  const novo: Servico = { id: novoId('s'), nome, descricao: i.descricao.trim(), preco_centavos: Math.round(i.preco_centavos), duracao_min: i.duracao_min, ativo: i.ativo }
  return { snapshot: { ...s, servicos: [...s.servicos, novo] }, resultado: ok(novo) }
}

export function alternarServico(s: Snapshot, id: string, ativo: boolean): { snapshot: Snapshot; resultado: Resultado<Servico> } {
  const alvo = s.servicos.find(x => x.id === id)
  if (!alvo) return { snapshot: s, resultado: falha('Serviço não encontrado.') }
  const atualizado = { ...alvo, ativo }
  return { snapshot: { ...s, servicos: s.servicos.map(x => (x.id === id ? atualizado : x)) }, resultado: ok(atualizado) }
}

export function salvarConfig(s: Snapshot, c: ConfigLoja): { snapshot: Snapshot; resultado: Resultado<ConfigLoja> } {
  if (!c.nome.trim()) return { snapshot: s, resultado: falha('O nome da barbearia não pode ficar vazio.') }
  const config = { ...c, nome: c.nome.trim(), comissao_pct: Math.max(0, Math.min(100, Number(c.comissao_pct) || 0)) }
  return { snapshot: { ...s, config }, resultado: ok(config) }
}

