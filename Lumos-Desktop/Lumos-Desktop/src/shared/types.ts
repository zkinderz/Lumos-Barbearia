export type StatusAgendamento = 'pendente' | 'confirmado' | 'concluido' | 'faltou'

export interface Servico {
  id: string
  nome: string
  descricao: string
  preco_centavos: number
  duracao_min: number
  ativo: boolean
}

export interface Cliente {
  id: string
  nome: string
  telefone: string
  email: string
  obs?: string
  aceite_lgpd_versao?: string | null
  origem?: 'desktop' | 'web' | 'importado'
  criado_em: string
}

export interface Agendamento {
  id: string
  cliente_id: string
  servico_id: string
  data: string
  horario: string
  status: StatusAgendamento
  origem: 'desktop' | 'web'
  obs?: string
  criado_em: string
}

export interface ConfigLoja {
  nome: string
  endereco: string
  whatsapp: string
  comissao_pct: number
}

export interface Snapshot {
  clientes: Cliente[]
  servicos: Servico[]
  agendamentos: Agendamento[]
  config: ConfigLoja
}
