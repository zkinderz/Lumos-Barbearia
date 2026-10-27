import { useEffect, useMemo, useRef, useState } from 'react'
import { useLumos } from '../estado'
import { api } from '../api'
import { Cartao, useAviso, Vazio } from '../componentes/ui'
import { Icone } from '../componentes/Icones'
import { SLOTS, DIAS_ABERTOS, diaDaSemana, dataExtenso, formatarTelefone, hoje, moeda, NOMES_DIAS_CURTO, slotJaPassou, somarDias } from '../../shared/rules'
import type { Agendamento } from '../../shared/types'

const semAcento = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Dias abertos ao redor de uma data (janela de 14 dias para frente/trás). */
function diasProximos(base: string): string[] {
  const inicio = somarDias(base, -7)
  const lista: string[] = []
  for (let i = 0; i < 21; i++) {
    const d = somarDias(inicio, i)
    if (DIAS_ABERTOS.includes(diaDaSemana(d))) lista.push(d)
  }
  return lista
}

export function Agenda({ data, setData, abrirReserva }: {
  data: string
  setData: (d: string) => void
  abrirReserva: (data: string, editar?: Agendamento) => void
}) {
  const { dados, recarregar } = useLumos()
  const avisar = useAviso()
  const [filtro, setFiltro] = useState<'todos' | 'pendente' | 'confirmado'>('todos')
  const [busca, setBusca] = useState('')
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)
  const refBusca = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const ir = (e: Event) => {
      const detalhe = (e as CustomEvent<{ data: string; id: string }>).detail
      setData(detalhe.data)
      setTimeout(() => document.getElementById(`slot-${detalhe.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120)
    }
    window.addEventListener('lumos:ir-agenda', ir)
    return () => window.removeEventListener('lumos:ir-agenda', ir)
  }, [setData])

  const doDia = useMemo(() => dados.agendamentos.filter(a => a.data === data), [dados.agendamentos, data])
  const dias = useMemo(() => diasProximos(hoje() > data ? data : hoje()), [data])

  const visiveis = useMemo(() => {
    const t = semAcento(busca.trim())
    return doDia
      .filter(a => filtro === 'todos' || a.status === filtro)
      .filter(a => {
        if (!t) return true
        const c = dados.clientes.find(x => x.id === a.cliente_id)
        return semAcento(c?.nome ?? '').includes(t) || semAcento(c?.telefone ?? '').includes(t)
      })
      .sort((x, y) => x.horario.localeCompare(y.horario))
  }, [doDia, filtro, busca, dados.clientes])
  const visiveisIds = useMemo(() => new Set(visiveis.map(a => a.id)), [visiveis])

  async function mudarStatus(a: Agendamento, status: Agendamento['status']) {
    const r = await api.mudarStatus(a.id, status)
    if (!r.ok) return avisar({ tipo: 'erro', titulo: 'Não deu para alterar', detalhe: r.erro })
    await recarregar()
    avisar({ tipo: 'ok', titulo: status === 'confirmado' ? 'Presença confirmada' : status === 'concluido' ? 'Atendimento concluído' : status === 'faltou' ? 'Registrado como falta' : 'Volto para pendente', detalhe: `${a.horario} · ${dataExtenso(a.data)}` })
  }

  async function cancelar(a: Agendamento) {
    const r = await api.removerAgendamento(a.id)
    if (!r.ok) return avisar({ tipo: 'erro', titulo: 'Não deu para cancelar', detalhe: r.erro })
    await recarregar()
    avisar({ tipo: 'ok', titulo: 'Horário liberado', detalhe: `${a.horario} de ${dataExtenso(a.data)} voltou a ficar vago` })
  }

  async function soltar(horario: string) {
    if (!arrastando) return
    const r = await api.remarcar(arrastando, data, horario)
    setArrastando(null)
    setAlvo(null)
    if (!r.ok) return avisar({ tipo: 'erro', titulo: 'Remarcação bloqueada', detalhe: r.erro })
    await recarregar()
    avisar({ tipo: 'ok', titulo: 'Horário movido', detalhe: `${dataExtenso(data)} às ${horario}` })
  }

  return (
    <div className="agenda-grid">
      <Cartao
        titulo={`Segunda a sábado · ${dataExtenso(data)} (${NOMES_DIAS_CURTO[diaDaSemana(data)]})`}
        acao={<>
          <button className="btn mini" onClick={() => setData(somarDias(data, -1))} title="dia anterior">‹</button>
          <button className="btn mini ouro" onClick={() => setData(hoje())}>hoje</button>
          <button className="btn mini" onClick={() => setData(somarDias(data, 1))} title="próximo dia">›</button>
        </>}
      >
        <div className="dias">
          {dias.map(d => {
            const n = dados.agendamentos.filter(a => a.data === d && a.status !== 'faltou').length
            return (
              <button key={d} className={`dia ${d === data ? 'ativo' : ''} ${n >= SLOTS.length ? 'ocupado' : ''}`} onClick={() => setData(d)}>
                <div className="r">{NOMES_DIAS_CURTO[diaDaSemana(d)]}</div>
                <div className="n">{d.slice(8)}</div>
                <div className="r">{n ? `${n}h` : 'livre'}</div>
              </button>
            )
          })}
        </div>

        <div style={{ padding: '0 16px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="chips">
            {(['todos', 'pendente', 'confirmado'] as const).map(f => (
              <button key={f} className={`chip ${filtro === f ? 'ativo' : ''}`} onClick={() => setFiltro(f)}>{f}</button>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
            <Icone.buscar size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--texto-3)' }} />
            <input ref={refBusca} value={busca} onChange={e => setBusca(e.target.value)} placeholder="achar cliente nesta data" style={{ paddingLeft: 30 }} />
          </div>
          <button className="btn ouro" onClick={() => abrirReserva(data)}><Icone.mais size={15} /> nova reserva</button>
        </div>

        <div className="fila">
          {SLOTS.map(h => {
            const ocupado = doDia.find(a => a.horario === h)
            if (ocupado && !visiveisIds.has(ocupado.id)) return null
            const cliente = ocupado ? dados.clientes.find(c => c.id === ocupado.cliente_id) : undefined
            const servico = ocupado ? dados.servicos.find(s => s.id === ocupado.servico_id) : undefined
            const passou = slotJaPassou(data, h)
            if (ocupado) {
              return (
                <div key={h} id={`slot-${ocupado.id}`}
                  className={`slot ocupado ${ocupado.status} ${arrastando === ocupado.id ? 'arrastando' : ''} ${alvo === h ? 'alvo' : ''} ${passou ? 'passado' : ''}`}
                  draggable={!passou}
                  onDragStart={() => setArrastando(ocupado.id)}
                  onDragEnd={() => { setArrastando(null); setAlvo(null) }}
                  onDragOver={e => { if (arrastando && arrastando !== ocupado.id) { e.preventDefault(); setAlvo(h) } }}
                  onDrop={() => soltar(h)}>
                  <div className="hora">{h}</div>
                  <div>
                    <div className="nome">{cliente?.nome ?? 'cliente removido'}</div>
                    <div className="det">
                      {servico?.nome} · {servico ? moeda(servico.preco_centavos) : '—'}
                      {cliente?.telefone ? ` · ${formatarTelefone(cliente.telefone)}` : ''}
                      {ocupado.origem === 'web' ? ' · pelo site' : ''}
                      {ocupado.obs ? ` · “${ocupado.obs}”` : ''}
                    </div>
                  </div>
                  <div className="acoes">
                    {ocupado.status === 'pendente' && <button className="btn mini" onClick={() => mudarStatus(ocupado, 'confirmado')}><Icone.check size={13} /> confirmar</button>}
                    {ocupado.status !== 'concluido' && data <= hoje() && <button className="btn mini" onClick={() => mudarStatus(ocupado, 'concluido')}>atendido</button>}
                    {ocupado.status !== 'faltou' && data <= hoje() && <button className="btn mini fantasma" onClick={() => mudarStatus(ocupado, 'faltou')}>falta</button>}
                    {!passou && <button className="btn mini fantasma" onClick={() => abrirReserva(data, ocupado)} title="remarcar">remarcar</button>}
                    <button className="btn mini perigo" onClick={() => cancelar(ocupado)} title="liberar horário"><Icone.x size={13} /></button>
                  </div>
                </div>
              )
            }
            return (
              <div key={h} className={`slot livre ${passou ? 'passado' : ''}`}
                onDragOver={e => { if (arrastando) { e.preventDefault(); setAlvo(h) } }}
                onDragLeave={() => setAlvo(a => (a === h ? null : a))}
                onDrop={() => soltar(h)}>
                <div className="hora">{h}</div>
                <div className="nome">{alvo === h && arrastando ? 'solte para mover para cá' : 'em aberto'}</div>
                <div className="acao-livre">
                  {!passou && <button className="btn mini ouro" onClick={() => abrirReserva(data)}><Icone.mais size={13} /> reservar</button>}
                </div>
              </div>
            )
          })}
          {doDia.length === 0 && <Vazio texto={`Nada marcado para ${dataExtenso(data)}. Arraste um horário de outro dia para cá, ou reserve direto.`} />}
        </div>
      </Cartao>

      <div className="grade" style={{ gap: 14 }}>
        <Cartao titulo="Como está a semana">
          <div className="bloco-oeste">
            {dias.slice(0, 6).map(d => {
              const tomados = dados.agendamentos.filter(a => a.data === d && a.status !== 'faltou').length
              const pct = Math.round((tomados / SLOTS.length) * 100)
              return (
                <div key={d} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', fontSize: 12, color: 'var(--texto-2)', marginBottom: 4 }}>
                    <span>{dataExtenso(d)}</span><span style={{ marginLeft: 'auto' }}>{tomados}/{SLOTS.length}</span>
                  </div>
                  <div style={{ height: 6, background: '#20242b', borderRadius: 20, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: d === data ? 'var(--ouro)' : pct > 70 ? 'var(--bordeaux)' : '#39414c', transition: 'width .4s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Cartao>

        <Cartao titulo="Arraste para remarcar">
          <div className="bloco-oeste" style={{ color: 'var(--texto-2)', fontSize: 12.5, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 8px' }}>Puxe um horário tomado e solte em um bloco vago. O app conferra a duração do serviço e, se o slot já tiver donos, o banco recusa e você vê o motivo no aviso.</p>
            <p style={{ margin: 0, color: 'var(--texto-3)' }}>Atalhos: <kbd style={{ fontSize: 11 }}>Ctrl</kbd>+<kbd style={{ fontSize: 11 }}>N</kbd> nova reserva · <kbd style={{ fontSize: 11 }}>Ctrl</kbd>+<kbd style={{ fontSize: 11 }}>K</kbd> busca rápida · <kbd style={{ fontSize: 11 }}>1</kbd> a <kbd style={{ fontSize: 11 }}>5</kbd> trocam de tela.</p>
          </div>
        </Cartao>
      </div>
    </div>
  )
}
