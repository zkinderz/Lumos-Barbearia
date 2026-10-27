import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './api'
import type { Snapshot } from '../shared/types'
import { SNAPSHOT_VAZIO } from '../shared/repositorio'

interface Estado {
  dados: Snapshot
  carregando: boolean
  erro: string | null
  recarregar: () => Promise<void>
  acao: <T extends { ok: boolean; erro?: string }>(r: T, sucesso?: string) => T
}

const Contexto = createContext<Estado>(null as unknown as Estado)
export const useLumos = (): Estado => useContext(Contexto)

export function ProvedorDados({ children }: { children: ReactNode }) {
  const [dados, setDados] = useState<Snapshot>(SNAPSHOT_VAZIO)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    try {
      setDados(await api.snapshot())
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível ler os dados')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { void recarregar() }, [recarregar])

  // a agenda muda pelo site também: ao voltar para a janela, atualiza
  useEffect(() => {
    const foco = () => { if (document.visibilityState === 'visible') void recarregar() }
    window.addEventListener('focus', foco)
    document.addEventListener('visibilitychange', foco)
    return () => { window.removeEventListener('focus', foco); document.removeEventListener('visibilitychange', foco) }
  }, [recarregar])

  const valor = useMemo<Estado>(() => ({
    dados, carregando, erro, recarregar,
    acao: r => r
  }), [dados, carregando, erro, recarregar])

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}
