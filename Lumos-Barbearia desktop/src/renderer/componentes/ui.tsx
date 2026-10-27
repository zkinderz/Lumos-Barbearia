import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icone } from './Icones'

/* ---------------------------------------------------------------- toasts */
export interface Toast { tipo: 'ok' | 'erro' | 'info'; titulo: string; detalhe?: string }
type Avisar = (t: Omit<Toast, 'tipo'> & { tipo?: Toast['tipo'] }) => void

const ContextoToast = createContext<Avisar>(() => undefined)
export const useAviso = (): Avisar => useContext(ContextoToast)

export function ProvedorToast({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<(Toast & { chave: number })[]>([])
  const id = useRef(0)

  const avisar = useCallback<Avisar>(t => {
    const chave = ++id.current
    setLista(atual => [...atual.slice(-3), { tipo: t.tipo ?? 'info', titulo: t.titulo, detalhe: t.detalhe, chave }])
    setTimeout(() => setLista(atual => atual.filter(x => x.chave !== chave)), 5200)
  }, [])

  return (
    <ContextoToast.Provider value={avisar}>
      {children}
      <div className="toasts">
        {lista.map(t => (
          <div key={t.chave} className={`toast ${t.tipo}`} onClick={() => setLista(l => l.filter(x => x.chave !== t.chave))}>
            {t.tipo === 'erro' ? <Icone.alerta size={16} /> : t.tipo === 'ok' ? <Icone.check size={16} /> : <Icone.relogio size={16} />}
            <div>
              <b>{t.titulo}</b>
              {t.detalhe && <small>{t.detalhe}</small>}
            </div>
          </div>
        ))}
      </div>
    </ContextoToast.Provider>
  )
}

/* ----------------------------------------------------------------- modal */
export function Modal({ titulo, aoFechar, rodape, largo, children }: {
  titulo: string; aoFechar: () => void; rodape?: ReactNode; largo?: boolean; children: ReactNode
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); aoFechar() } }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [aoFechar])

  return (
    <div className="fundo-modal" onMouseDown={e => { if (e.target === e.currentTarget) aoFechar() }}>
      <div className={`modal ${largo ? 'grande' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <header>
          <h3>{titulo}</h3>
          <button className="fechar" onClick={aoFechar} aria-label="Fechar">×</button>
        </header>
        <div className="corpo">{children}</div>
        {rodape && <footer>{rodape}</footer>}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- campo */
export function Campo({ rotulo, dica, erro, children }: { rotulo: string; dica?: string; erro?: string; children: ReactNode }) {
  return (
    <div className="campo">
      <label>{rotulo}</label>
      {children}
      {erro ? <span className="alerta">{erro}</span> : dica ? <span className="dica">{dica}</span> : null}
    </div>
  )
}

export function Cartao({ titulo, acao, children, className = '' }: { titulo?: string; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`painel ${className}`}>
      {titulo && (
        <div className="painel-titulo">
          <h3>{titulo}</h3>
          <div className="espaco" />
          {acao}
        </div>
      )}
      {children}
    </section>
  )
}

export function Vazio({ texto, acao }: { texto: string; acao?: ReactNode }) {
  return <div className="vazio">{texto}{acao && <div style={{ marginTop: 12 }}>{acao}</div>}</div>
}

/** Clique no valor: edição inline sem sair da tela. `formatar` só muda a exibição. */
export function InlineEdit({ valor, aoSalvar, largura = 'auto', tipo = 'text', sufixo, formatar }: {
  valor: string | number; aoSalvar: (v: string) => void; largura?: string | number; tipo?: 'text' | 'number'; sufixo?: string
  formatar?: (v: string | number) => string
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(String(valor))
  useEffect(() => setTexto(String(valor)), [valor])
  if (!editando) {
    return (
      <button className="btn fantasma mini" style={{ width: largura, justifyContent: 'flex-start' }}
        onClick={() => setEditando(true)} title="Clique para editar">
        {formatar ? formatar(valor) : texto}{sufixo ? ` ${sufixo}` : ''}
      </button>
    )
  }
  return (
    <input
      autoFocus type={tipo} value={texto} style={{ width: largura }}
      onChange={e => setTexto(e.target.value)}
      onBlur={() => { setEditando(false); if (texto !== String(valor)) aoSalvar(texto) }}
      onKeyDown={e => {
        if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() }
        if (e.key === 'Escape') { setTexto(String(valor)); setEditando(false) }
      }}
    />
  )
}
