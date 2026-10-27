import type { Repositorio, Resultado } from '../shared/repositorio'
import type { Snapshot } from '../shared/types'
import { criarRepositorioLocal, criarAdaptadorLocalStorage } from '../shared/adaptadores'

/** Métodos expostos pelo preload do Electron. */
interface PonteElectron {
  snapshot(): Promise<Resultado<Snapshot>>
  criarAgendamento(i: Parameters<Repositorio['criarAgendamento']>[0]): Promise<Resultado<unknown>>
  remarcarAgendamento(id: string, data: string, horario: string): Promise<Resultado<unknown>>
  mudarStatus(id: string, status: string): Promise<Resultado<unknown>>
  removerAgendamento(id: string): Promise<Resultado<unknown>>
  salvarCliente(i: Parameters<Repositorio['salvarCliente']>[0]): Promise<Resultado<unknown>>
  excluirCliente(id: string): Promise<Resultado<{ cancelados: number }>>
  exportarCliente(id: string): Promise<Resultado<unknown>>
  salvarServico(i: Parameters<Repositorio['salvarServico']>[0]): Promise<Resultado<unknown>>
  alternarServico(id: string, ativo: boolean): Promise<Resultado<unknown>>
  salvarConfigLoja(c: Snapshot['config']): Promise<Resultado<unknown>>
  conexaoObter(): Promise<{ modo: 'local' | 'supabase'; url: string; chave: string; namespace: string }>
  conexaoSalvar(c: { modo: 'local' | 'supabase'; url: string; chave: string; namespace: string }): Promise<Resultado<unknown>>
  conexaoTestar(): Promise<Resultado<{ clientes: number }>>
  dadosArquivo(): Promise<Resultado<{ caminho: string; os: string }>>
  onAtalho(receber: (acao: string) => void): () => void
}

declare global {
  interface Window { lumos?: PonteElectron }
}

const ponte = typeof window !== 'undefined' ? window.lumos : undefined

/** No Electron, toda escrita passa pelo processo main. Sem ele (`npm run web`),
 *  o mesmo repositório roda no navegador com localStorage — permite revisar o
 *  visual e testar as regras sem instalar nada. Os dados NÃO são compartilhados
 *  com o app de verdade: é apenas demonstração de interface. */
const demonstracao: Repositorio = criarRepositorioLocal(criarAdaptadorLocalStorage())

export const emDemonstracao = !ponte

export const api = {
  async snapshot(): Promise<Snapshot> {
    if (ponte) {
      const r = await ponte.snapshot()
      if (!r.ok) throw new Error(r.erro ?? 'falha ao carregar os dados')
      return r.dados as Snapshot
    }
    return demonstracao.snapshot()
  },

  async criarAgendamento(i: Parameters<Repositorio['criarAgendamento']>[0]): Promise<Resultado<unknown>> {
    if (ponte) return (await ponte.criarAgendamento(i)) as Resultado
    return demonstracao.criarAgendamento(i)
  },

  async remarcar(id: string, data: string, horario: string): Promise<Resultado<unknown>> {
    if (ponte) return (await ponte.remarcarAgendamento(id, data, horario)) as Resultado
    return demonstracao.remarcarAgendamento(id, data, horario)
  },

  async mudarStatus(id: string, status: 'pendente' | 'confirmado' | 'concluido' | 'faltou'): Promise<Resultado<unknown>> {
    if (ponte) return (await ponte.mudarStatus(id, status)) as Resultado
    return demonstracao.mudarStatusAgendamento(id, status)
  },

  async removerAgendamento(id: string): Promise<Resultado<unknown>> {
    if (ponte) return (await ponte.removerAgendamento(id)) as Resultado
    return demonstracao.removerAgendamento(id)
  },

  async salvarCliente(i: Parameters<Repositorio['salvarCliente']>[0]): Promise<Resultado<unknown>> {
    if (ponte) return (await ponte.salvarCliente(i)) as Resultado
    return demonstracao.salvarCliente(i)
  },

  async excluirCliente(id: string): Promise<Resultado<{ cancelados: number }>> {
    if (ponte) return ponte.excluirCliente(id)
    return demonstracao.excluirCliente(id)
  },

  async exportarCliente(id: string): Promise<Resultado<unknown>> {
    if (ponte) return (await ponte.exportarCliente(id)) as Resultado
    return demonstracao.exportarCliente(id)
  },

  async salvarServico(i: Parameters<Repositorio['salvarServico']>[0]): Promise<Resultado<unknown>> {
    if (ponte) return (await ponte.salvarServico(i)) as Resultado
    return demonstracao.salvarServico(i)
  },

  async alternarServico(id: string, ativo: boolean): Promise<Resultado<unknown>> {
    if (ponte) return (await ponte.alternarServico(id, ativo)) as Resultado
    return demonstracao.alternarServico(id, ativo)
  },

  async salvarConfigLoja(c: Snapshot['config']): Promise<Resultado<unknown>> {
    if (ponte) return (await ponte.salvarConfigLoja(c)) as Resultado
    return demonstracao.salvarConfig(c)
  },

  async conexao(): Promise<{ modo: 'local' | 'supabase'; url: string; chave: string; namespace: string } | null> {
    if (!ponte) return { modo: 'local', url: '', chave: '', namespace: 'public' }
    return ponte.conexaoObter()
  },

  async salvarConexao(c: { modo: 'local' | 'supabase'; url: string; chave: string; namespace: string }): Promise<Resultado<unknown>> {
    if (!ponte) return { ok: false, erro: 'Disponível apenas no app desktop.' }
    return (await ponte.conexaoSalvar(c)) as Resultado
  },

  async testarConexao(): Promise<Resultado<{ clientes: number }>> {
    if (!ponte) return { ok: false, erro: 'Disponível apenas no app desktop.' }
    return ponte.conexaoTestar()
  },

  async caminhoDados(): Promise<string | null> {
    if (!ponte) return 'localStorage do navegador (demonstração)'
    const r = await ponte.dadosArquivo()
    return r.ok ? (r.dados as { caminho: string }).caminho : null
  },

  onAtalho(receber: (acao: string) => void): () => void {
    if (ponte) return ponte.onAtalho(receber)
    return () => undefined
  }
}
