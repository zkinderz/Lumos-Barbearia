import type { Snapshot } from './types'
import { SNAPSHOT_VAZIO, SEMEAR_SERVICOS, validarSnapshotBruto, type Repositorio, type Resultado } from './repositorio'
import {
  alternarServico, criarAgendamento, excluirCliente, exportarCliente, mudarStatus,
  removerAgendamento, remarcar, salvarCliente, salvarConfig, salvarServico
} from './memoria'

/** Só faz sentido persistir se o estado novo couber no adaptador. */
export interface AdaptadorBruto {
  carregar(): Snapshot
  salvar(s: Snapshot): void
}

export function snapshotInicial(): Snapshot {
  return { ...SNAPSHOT_VAZIO, servicos: SEMEAR_SERVICOS() }
}

/** O mesmo núcleo de regra de negócio atendendo qualquer adaptador síncrono.
 *  Usado pelo arquivo JSON no Electron e pelo localStorage no modo demonstração. */
export function criarRepositorioLocal(adaptador: AdaptadorBruto): Repositorio {
  let cache: Snapshot | null = null

  const estado = (): Snapshot => {
    if (!cache) cache = validarSnapshotBruto(adaptador.carregar())
    if (!cache.servicos.length) cache = { ...cache, servicos: snapshotInicial().servicos }
    return cache
  }
  const gravar = (novo: Snapshot) => {
    adaptador.salvar(novo)
    cache = novo
  }
  const aplicar = <T,>(fn: (s: Snapshot) => { snapshot: Snapshot; resultado: Resultado<T> }): Promise<Resultado<T>> => {
    const { snapshot, resultado } = fn(estado())
    if (resultado.ok) gravar(snapshot)
    return Promise.resolve(resultado)
  }

  return {
    snapshot: async () => estado(),
    criarAgendamento: i => aplicar(s => criarAgendamento(s, i)),
    remarcarAgendamento: (id, data, horario) => aplicar(s => remarcar(s, id, data, horario)),
    mudarStatusAgendamento: (id, status) => aplicar(s => mudarStatus(s, id, status)),
    removerAgendamento: id => aplicar(s => removerAgendamento(s, id)),
    salvarCliente: i => aplicar(s => salvarCliente(s, i)),
    excluirCliente: id => aplicar<{ cancelados: number }>(s => excluirCliente(s, id)),
    exportarCliente: async id => exportarCliente(estado(), id).resultado,
    salvarServico: i => aplicar(s => salvarServico(s, i)),
    alternarServico: (id, ativo) => aplicar(s => alternarServico(s, id, ativo)),
    salvarConfig: c => aplicar(s => salvarConfig(s, c))
  }
}

const CHAVE_LS = 'lumos:snapshot:v1'

/** localStorage: usado por `npm run web` (demonstração no navegador) e em dev. */
export function criarAdaptadorLocalStorage(): AdaptadorBruto {
  return {
    carregar() {
      try {
        const bruto = localStorage.getItem(CHAVE_LS)
        return bruto ? (JSON.parse(bruto) as Snapshot) : snapshotInicial()
      } catch {
        return snapshotInicial()
      }
    },
    salvar(s: Snapshot) {
      localStorage.setItem(CHAVE_LS, JSON.stringify(s))
    }
  }
}
