import { contextBridge, ipcRenderer } from 'electron'

/** Ponte mínima e nomeada: o renderer nunca toca em fs, net ou chaves. */
const invocar = (canal: string, argumento?: unknown) => ipcRenderer.invoke(canal, argumento)

contextBridge.exposeInMainWorld('lumos', {
  snapshot: () => invocar('snapshot'),
  criarAgendamento: (i: unknown) => invocar('criar-agendamento', i),
  remarcarAgendamento: (id: string, data: string, horario: string) => invocar('remarcar-agendamento', { id, data, horario }),
  mudarStatus: (id: string, status: string) => invocar('mudar-status', { id, status }),
  removerAgendamento: (id: string) => invocar('remover-agendamento', id),
  salvarCliente: (i: unknown) => invocar('salvar-cliente', i),
  excluirCliente: (id: string) => invocar('excluir-cliente', id),
  exportarCliente: (id: string) => invocar('exportar-cliente', id),
  salvarServico: (i: unknown) => invocar('salvar-servico', i),
  alternarServico: (id: string, ativo: boolean) => invocar('alternar-servico', { id, ativo }),
  salvarConfigLoja: (c: unknown) => invocar('salvar-config-loja', c),
  conexaoObter: () => invocar('conexao-obter'),
  conexaoSalvar: (c: unknown) => invocar('conexao-salvar', c),
  conexaoTestar: () => invocar('conexao-testar'),
  dadosArquivo: () => invocar('dados-arquivo'),
  mostrarArquivo: (caminho: string) => invocar('abril-caminho', caminho),
  onAtalho: (receber: (acao: string) => void) => {
    const escuta = (_e: unknown, acao: string) => receber(acao)
    ipcRenderer.on('atalho', escuta)
    return () => ipcRenderer.removeListener('atalho', escuta)
  }
})
