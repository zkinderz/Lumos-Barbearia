import { useMemo, useState } from 'react'
import { useLumos } from '../estado'
import { Cartao, Vazio } from '../componentes/ui'
import { Icone } from '../componentes/Icones'
import {
  DIAS_ABERTOS, SLOTS, dataExtenso, diaDaSemana, faturamentoPrevisto, formatarTelefone,
  hoje, moeda, proximoAgendamento, slotJaPassou, somarDias, taxaOcupacao
} from '../../shared/rules'
import type { Agendamento } from '../../shared/types'

const agoraHHMM = (): string => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function Painel({ ir }: { ir: (tela: string, dado?: string) => void }) {
  const { dados, carregando } = useLumos()
  const [verComissao, setVerComissao] = useState(true)
  const dia = hoje()
  const agora = agoraHHMM()

  const doDia = useMemo(
    () => dados.agendamentos.filter(a => a.data === dia).sort((x, y) => x.horario.localeCompare(y.horario)),
    [dados.agendamentos, dia]
  )

  const semana = useMemo(() => {
    const hojeObj = new Date(`${dia}T12:00:00`)
    const inicio = somarDias(dia, -((hojeObj.getDay() + 5) % 7))
    const dias: string[] = []
    for (let i = 0; i < 7 && dias.length < 6; i++) {
      const cand = somarDias(inicio, i)
      if (DIAS_ABERTOS.includes(diaDaSemana(cand))) dias.push(cand)
    }
    return dias.map(d => ({
      d,
      total: dados.agendamentos.filter(a => a.data === d && a.status !== 'faltou').length,
      bruto: faturamentoPrevisto(dados.agendamentos, dados.servicos, d, d)
    }))
  }, [dados, dia])

  const fila = useMemo(() => {
    const ate = somarDias(dia, 12)
    const porDia = new Map<string, Agendamento[]>()
    for (const a of dados.agendamentos
      .filter(a => a.data >= dia && a.data <= ate && (a.status === 'pendente' || a.status === 'confirmado'))
      .sort((x, y) => (x.data + x.horario).localeCompare(y.data + y.horario))) {
      if (a.data === dia && slotJaPassou(a.data, a.horario)) continue
      porDia.set(a.data, [...(porDia.get(a.data) ?? []), a])
    }
    return [...porDia.entries()]
  }, [dados.agendamentos, dia])

  const proximo = proximoAgendamento(dados.agendamentos)
  const pendentes = doDia.filter(a => a.status === 'pendente').length
  const brutoHoje = faturamentoPrevisto(dados.agendamentos, dados.servicos, dia, dia)
  const faltas = dados.agendamentos.filter(a => a.status === 'faltou' && a.data >= somarDias(dia, -27)).length
  const ativos = new Set(dados.agendamentos.filter(a => a.data >= somarDias(dia, -89)).map(a => a.cliente_id)).size
  const maximo = Math.max(1, ...semana.map(s => s.total))

  if (carregando) {
    return (
      <div className="grade" style={{ gap: 14 }}>
        <div className="kpis">{[0, 1, 2, 3].map(i => <div key={i} className="painel" style={{ height: 104 }} />)}</div>
        <div className="duas-colunas"><div className="painel" style={{ height: 320 }} /><div className="painel" style={{ height: 320 }} /></div>
      </div>
    )
  }

  return (
    <div className="grade" style={{ gap: 14 }}>
      <div className="kpis">
        <Cartao className="kpi ouro">
          <div className="rotulo">Hoje</div>
          <div className="valor">{doDia.length}<small>/{SLOTS.length}</small></div>
          <div className="pe">{taxaOcupacao(dados.agendamentos, dia)}% da agenda tomada{pendentes ? ` · ${pendentes} sem presença confirmada` : ''}</div>
        </Cartao>
        <Cartao className="kpi">
          <div className="rotulo">Previsto hoje</div>
          <div className="valor">{moeda(brutoHoje)}</div>
          <button className="pe btn fantasma" style={{ border: 0, padding: 0, height: 'auto', fontSize: 11.5, color: 'var(--texto-3)' }}
            onClick={() => setVerComissao(v => !v)}>
            {verComissao ? 'ocultar comissão' : `comissão ${dados.config.comissao_pct}% = ${moeda(Math.round(brutoHoje * dados.config.comissao_pct / 100))}`}
          </button>
        </Cartao>
        <Cartao className="kpi">
          <div className="rotulo">Clientes com horário em 90 dias</div>
          <div className="valor">{ativos}</div>
          <div className="pe">balcão + site na mesma base</div>
        </Cartao>
        <Cartao className="kpi">
          <div className="rotulo">Faltas em 30 dias</div>
          <div className="valor">{faltas}</div>
          <div className="pe">{dados.agendamentos.filter(a => a.origem === 'web').length} reservas entraram pelo site</div>
        </Cartao>
      </div>

      <div className="duas-colunas">
        <Cartao titulo={`Agenda de hoje · ${dataExtenso(dia)}`}
          acao={<button className="btn mini" onClick={() => ir('agenda', dia)}>abrir completa <Icone.seta size={13} /></button>}>
          {doDia.length === 0
            ? <Vazio texto="Nenhum horário tomado hoje." acao={<button className="btn ouro" onClick={() => ir('agenda', dia)}>reservar o primeiro</button>} />
            : (
              <table className="tabela">
                <tbody>
                  {doDia.map(a => {
                    const c = dados.clientes.find(x => x.id === a.cliente_id)
                    const s = dados.servicos.find(x => x.id === a.servico_id)
                    return (
                      <tr key={a.id} style={{ opacity: a.horario < agora ? 0.5 : 1 }}>
                        <td style={{ width: 56, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{a.horario}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{c?.nome ?? 'cliente removido'}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--texto-3)' }}>{s?.nome ?? '—'} · {a.origem === 'web' ? 'pelo site' : 'balcão'}</div>
                        </td>
                        <td style={{ width: 120 }}>{c ? formatarTelefone(c.telefone) : ''}</td>
                        <td style={{ width: 96 }}><span className={`selo ${a.status}`}>{a.status}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
        </Cartao>

        <div className="grade" style={{ gap: 14 }}>
          {proximo && (
            <Cartao>
              <div className="ressalte">
                <div className="quando">{proximo.horario}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="rotulo">próximo na fila</div>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {dados.clientes.find(c => c.id === proximo.cliente_id)?.nome ?? '—'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--texto-2)' }}>
                    {dataExtenso(proximo.data)} · {dados.servicos.find(s => s.id === proximo.servico_id)?.nome ?? '—'}
                  </div>
                </div>
              </div>
            </Cartao>
          )}
          <Cartao titulo="Semana">
            <div className="grafico">
              {semana.map(s => (
                <button key={s.d} className={`barra ${s.d === dia ? 'atual' : ''}`} onClick={() => ir('agenda', s.d)} title={`${s.total} horários · ${moeda(s.bruto)}`}>
                  <small>{s.total || ''}</small>
                  <div className="traco" style={{ height: `${s.total ? Math.max(6, (s.total / maximo) * 100) : 3}%`, background: s.d === dia ? 'var(--ouro)' : '#2f3540' }} />
                  <span>{s.d === dia ? 'hoje' : dataExtenso(s.d).split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </Cartao>
        </div>
      </div>

      <Cartao titulo="Fila dos próximos dias"
        acao={<button className="btn mini" onClick={() => ir('agenda', fila[0]?.[0] ?? dia)}>ver agenda <Icone.seta size={13} /></button>}>
        {fila.length === 0
          ? <Vazio texto="Nada agendado daqui para frente. Assim que o site ou o balcão reservarem, aparece aqui." />
          : (
            <div className="fila-dias">
              {fila.map(([d, lista]) => (
                <button key={d} className="coluna-dia" onClick={() => ir('agenda', d)}>
                  <div className="linha" style={{ marginBottom: 8 }}>
                    <b style={{ fontSize: 12.5, color: d === dia ? 'var(--ouro)' : undefined }}>{dataExtenso(d)}</b>
                    <span className="selo sutil" style={{ marginLeft: 'auto' }}>{lista.length}</span>
                  </div>
                  {lista.slice(0, 5).map(a => (
                    <div key={a.id} className="linha-livre" title={dados.servicos.find(s => s.id === a.servico_id)?.nome}>
                      <span style={{ color: a.status === 'confirmado' ? 'var(--ok)' : 'var(--texto-3)' }}>{a.horario}</span>
                      <span className="corte">{dados.clientes.find(c => c.id === a.cliente_id)?.nome ?? '—'}</span>
                    </div>
                  ))}
                  {lista.length > 5 && <div style={{ fontSize: 11, color: 'var(--texto-3)', marginTop: 4 }}>+{lista.length - 5} outros</div>}
                </button>
              ))}
            </div>
          )}
      </Cartao>
    </div>
  )
}
