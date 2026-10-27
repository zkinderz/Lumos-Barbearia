import type { Agendamento, Cliente, ConfigLoja, Servico, Snapshot } from './types'

export const VERSAO_ESQUEMA = 1

export const SNAPSHOT_VAZIO: Snapshot = {
  clientes: [], servicos: [], agendamentos: [],
  config: { nome: 'Lumos Barbearia', endereco: '', whatsapp: '', comissao_pct: 30 }
}

export const SEMEAR_SERVICOS = (): Servico[] => [
  { id: 's1', nome: 'Corte Moderno', descricao: 'Estilo atualizado, adaptado ao seu perfil.', preco_centavos: 4500, duracao_min: 40, ativo: true },
  { id: 's2', nome: 'Barba Completa', descricao: 'Modelagem com toalha quente e produtos especiais.', preco_centavos: 3500, duracao_min: 40, ativo: true },
  { id: 's3', nome: 'Combo Completo', descricao: 'Corte + barba com atendimento VIP.', preco_centavos: 7000, duracao_min: 60, ativo: true }
]

export interface Resultado<T = void> {
  ok: boolean
  erro?: string
  dados?: T
}

/** Contrato único de dados. Local (arquivo) e Supabase implementam isto; as telas só falam aqui. */
export interface Repositorio {
  snapshot(): Promise<Snapshot>
  criarAgendamento(i: { cliente_id: string; servico_id: string; data: string; horario: string; obs?: string; origem?: 'desktop' | 'web' }): Promise<Resultado<Agendamento>>
  remarcarAgendamento(id: string, data: string, horario: string): Promise<Resultado<Agendamento>>
  mudarStatusAgendamento(id: string, status: Agendamento['status']): Promise<Resultado<Agendamento>>
  removerAgendamento(id: string): Promise<Resultado>
  salvarCliente(i: { id?: string; nome: string; telefone: string; email: string; obs?: string }): Promise<Resultado<Cliente>>
  excluirCliente(id: string): Promise<Resultado<{ cancelados: number }>>
  exportarCliente(id: string): Promise<Resultado<unknown>>
  salvarServico(i: { id?: string; nome: string; descricao: string; preco_centavos: number; duracao_min: number; ativo: boolean }): Promise<Resultado<Servico>>
  alternarServico(id: string, ativo: boolean): Promise<Resultado<Servico>>
  salvarConfig(c: ConfigLoja): Promise<Resultado<ConfigLoja>>
}

export function validarSnapshotBruto(bruto: unknown): Snapshot {
  const s = (bruto ?? {}) as Partial<Snapshot>
  return {
    clientes: Array.isArray(s.clientes) ? s.clientes : [],
    servicos: Array.isArray(s.servicos) && s.servicos.length ? s.servicos : SEMEAR_SERVICOS(),
    agendamentos: Array.isArray(s.agendamentos) ? s.agendamentos : [],
    config: { ...SNAPSHOT_VAZIO.config, ...(s.config ?? {}) }
  }
}
