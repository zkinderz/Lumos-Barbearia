import { useEffect, useMemo, useRef, useState } from 'react'
import { Icone } from './Icones'
import { useLumos } from '../estado'
import { formatarTelefone, dataExtenso } from '../../shared/rules'

export interface Comando {
  id: string
  rotulo: string
  detalhe?: string
  grupo: 'Navegar' | 'Ações' | 'Clientes' | 'Agenda'
  atalho?: string
  executar: () => void
}

/** Ctrl+K: navega, cria reserva e acha cliente no mesmo lugar. */
export function Paleta({ aberto, aoFechar, extras }: { aberto: boolean; aoFechar: () => void; extras: Comando[] }) {
  const { dados } = useLumos()
  const [texto, setTexto] = useState('')
  const [marca, setMarca] = useState(0)
  const caixa = useRef<HTMLInputElement>(null)

  useEffect(() => { if (aberto) { setTexto(''); setMarca(0); setTimeout(() => caixa.current?.focus(), 20) } }, [aberto])

  const itens = useMemo<Comando[]>(() => {
    const t = texto.trim().toLowerCase()
    const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const busca = (s: string) => semAcento(s).includes(semAcento(t))
    const acoes = [...extras]
    const clientes = dados.clientes.map(c => ({
      id: `cliente-${c.id}`, rotulo: c.nome, detalhe: formatarTelefone(c.telefone), grupo: 'Clientes' as const,
      executar: () => { aoFechar(); window.dispatchEvent(new CustomEvent('lumos:abrir-cliente', { detail: c.id })) }
    }))
    const proximos = dados.agendamentos
      .filter(a => a.status === 'pendente' || a.status === 'confirmado')
      .sort((x, y) => (x.data + x.horario).localeCompare(y.data + y.horario)).slice(0, 6)
      .map(a => {
        const cli = dados.clientes.find(c => c.id === a.cliente_id)
        return {
          id: `ag-${a.id}`, rotulo: `${dataExtenso(a.data)} ${a.horario} · ${cli?.nome ?? '—'}`,
          detalhe: dados.servicos.find(s => s.id === a.servico_id)?.nome, grupo: 'Agenda' as const,
          executar: () => { aoFechar(); window.dispatchEvent(new CustomEvent('lumos:ir-agenda', { detail: { data: a.data, id: a.id } })) }
        }
      })
    const tudo = [...acoes, ...proximos, ...(t.length >= 2 ? clientes : [])]
    return t ? tudo.filter(i => busca(i.rotulo) || busca(i.detalhe ?? '')) : tudo.slice(0, 12)
  }, [texto, dados, extras, aoFechar])

  useEffect(() => setMarca(m => Math.min(m, Math.max(0, itens.length - 1))), [itens])

  if (!aberto) return null

  const grupos = itens.reduce<Record<string, Comando[]>>((acc, i) => ({ ...acc, [i.grupo]: [...(acc[i.grupo] ?? []), i] }), {})
  let sequencia = -1

  return (
    <div className="fundo-modal" style={{ alignItems: 'flex-start', paddingTop: '12vh' }} onMouseDown={e => { if (e.target === e.currentTarget) aoFechar() }}>
      <div className="paleta">
        <input
          ref={caixa} value={texto} placeholder="Buscar cliente, ação ou horário…"
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setMarca(m => Math.min(m + 1, itens.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setMarca(m => Math.max(m - 1, 0)) }
            if (e.key === 'Enter') { e.preventDefault(); const alvo = itens[marca]; if (alvo) { alvo.executar(); aoFechar() } }
            if (e.key === 'Escape') aoFechar()
          }}
        />
        <div className="itens">
          {itens.length === 0 && <div className="vazio">Nada encontrado para “{texto}”.</div>}
          {Object.entries(grupos).map(([grupo, lista]) => (
            <div key={grupo}>
              <div className="grupo">{grupo}</div>
              {lista.map(i => {
                sequencia++
                const indice = sequencia
                return (
                  <div key={i.id} className={`item ${indice === marca ? 'selecionado' : ''}`}
                    onMouseEnter={() => setMarca(indice)}
                    onClick={() => { i.executar(); aoFechar() }}>
                    {i.grupo === 'Clientes' ? <Icone.pessoas size={15} /> : i.grupo === 'Agenda' ? <Icone.agenda size={15} /> : <Icone.raio size={15} />}
                    <span>{i.rotulo}</span>
                    {i.detalhe && <span className="tipo">{i.detalhe}</span>}
                    {i.atalho && <span className="tipo">{i.atalho}</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
