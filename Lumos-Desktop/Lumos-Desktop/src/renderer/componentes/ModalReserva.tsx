import { useEffect, useMemo, useState } from 'react'
import { Modal, Campo, useAviso } from './ui'
import { Icone } from './Icones'
import { useLumos } from '../estado'
import { api } from '../api'
import { SLOTS, slotsLivres, slotOcupado, validarData, validarTelefone, hoje, diaDaSemana, dataExtenso, slotsNecessarios, somaMinutos, moeda } from '../../shared/rules'
import type { Agendamento } from '../../shared/types'

const FECHAMENTO = '18:20' // último horário de saída do expediente (17:40 + 40 min)

/** Nova reserva do balcão, ou edição (remarcação) de uma existente. */
export function ModalReserva({ aberto, aoFechar, editar, dataInicial }: {
  aberto: boolean
  aoFechar: () => void
  editar?: Agendamento | null
  dataInicial?: string
}) {
  const { dados, recarregar } = useLumos()
  const avisar = useAviso()
  const [clienteId, setClienteId] = useState('')
  const [cadastrando, setCadastrando] = useState(false)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [servicoId, setServicoId] = useState('')
  const [data, setData] = useState(dataInicial ?? hoje())
  const [horario, setHorario] = useState('')
  const [obs, setObs] = useState('')
  const [erros, setErros] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

  const servicosAtivos = dados.servicos.filter(s => s.ativo)

  useEffect(() => {
    if (!aberto) return
    setErros([])
    setCadastrando(false)
    setClienteId(editar?.cliente_id ?? '')
    setServicoId(editar?.servico_id ?? servicosAtivos[0]?.id ?? '')
    setData(editar?.data ?? dataInicial ?? hoje())
    setHorario(editar?.horario ?? '')
    setObs(editar?.obs ?? '')
    setNome('')
    setTelefone('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, editar, dataInicial])

  const erroDoDia = validarData(data)
  const servico = servicosAtivos.find(s => s.id === servicoId)
  const blocos = slotsNecessarios(servico)

  const livres = useMemo(() => {
    const base = editar ? dados.agendamentos.filter(a => a.id !== editar.id) : dados.agendamentos
    return slotsLivres(base, data)
  }, [dados.agendamentos, data, editar])

  /** Bloco following da duração do serviço também precisa estar livre. */
  const blocoDisponivel = (h: string): { pode: boolean; motivo?: string } => {
    if (erroDoDia && !editar) return { pode: false, motivo: erroDoDia }
    if (!livres.includes(h)) return { pode: false, motivo: 'já reservado' }
    const base = editar ? dados.agendamentos.filter(a => a.id !== editar.id) : dados.agendamentos
    for (let k = 1; k < blocos; k++) {
      const extra = somaMinutos(h, k * 40)
      if (extra > FECHAMENTO) return { pode: false, motivo: 'não cabe até o fechamento' }
      if (slotOcupado(base, data, extra)) return { pode: false, motivo: `bloco ${extra} tomado` }
    }
    return { pode: true }
  }

  async function salvar() {
    const mensagens: string[] = []
    void erroDoDia
    if (cadastrando) {
      if (nome.trim().length < 2) mensagens.push('Informe o nome do cliente.')
      const { erro } = validarTelefone(telefone)
      if (erro) mensagens.push(erro)
    } else if (!clienteId) {
      mensagens.push('Escolha um cliente ou cadastre um novo.')
    }
    if (!editar) {
      const erroData = validarData(data)
      if (erroData) mensagens.push(erroData)
    }
    if (!servicoId) mensagens.push('Escolha um serviço.')
    if (!horario) mensagens.push('Escolha um horário.')
    if (horario && !blocoDisponivel(horario).pode && horario !== editar?.horario) {
      mensagens.push(`O horário ${horario} não está livre.`)
    }
    setErros(mensagens)
    if (mensagens.length) return

    setSalvando(true)
    try {
      let cliente = clienteId
      if (cadastrando) {
        const novo = await api.salvarCliente({ nome, telefone, email: '' })
        if (!novo.ok || !novo.dados) { setErros([novo.erro ?? 'Não foi possível salvar o cliente.']); return }
        cliente = (novo.dados as { id: string }).id
      }
      const r = editar
        ? await api.remarcar(editar.id, data, horario)
        : await api.criarAgendamento({ cliente_id: cliente, servico_id: servicoId, data, horario, obs, origem: 'desktop' })
      if (!r.ok) { setErros([r.erro ?? 'Não foi possível gravar o horário.']); return }
      await recarregar()
      avisar({ tipo: 'ok', titulo: editar ? 'Horário remarcado' : 'Reserva criada', detalhe: `${dataExtenso(data)} às ${horario} · ${servico?.nome ?? ''}` })
      aoFechar()
    } finally {
      setSalvando(false)
    }
  }

  if (!aberto) return null
  const clienteSelecionado = dados.clientes.find(c => c.id === clienteId)

  return (
    <Modal
      titulo={editar ? 'Remarcar horário' : 'Nova reserva no balcão'}
      aoFechar={aoFechar}
      rodape={<>
        <button className="btn fantasma" onClick={aoFechar}>Cancelar</button>
        <button className="btn ouro" onClick={salvar} disabled={salvando}>
          <Icone.check size={15} /> {salvando ? 'gravando…' : editar ? 'Confirmar nova data' : 'Reservar'}
        </button>
      </>}
    >
      {erros.length > 0 && <div className="alerta">{erros.map(m => <div key={m}>{m}</div>)}</div>}

      {cadastrando ? (
        <div className="campo duplo">
          <Campo rotulo="Nome do cliente">
            <input autoFocus value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: João da Silva" />
          </Campo>
          <Campo rotulo="Celular com DDD" dica="Usado para aviso no WhatsApp">
            <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(11) 90000-0000" inputMode="tel" />
          </Campo>
        </div>
      ) : (
        <Campo rotulo="Cliente" dica={clienteSelecionado ? `telefone ${clienteSelecionado.telefone}` : 'Cadastre na hora se for cliente novo.'}>
          <div className="linha">
            <select value={clienteId} onChange={e => setClienteId(e.target.value)}>
              <option value="">Selecione…</option>
              {dados.clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <button className="btn" onClick={() => setCadastrando(true)}><Icone.mais size={14} /> novo</button>
          </div>
        </Campo>
      )}
      {cadastrando && (
        <button className="btn fantasma mini" style={{ alignSelf: 'flex-start' }} onClick={() => setCadastrando(false)}>
          <Icone.seta size={13} style={{ transform: 'rotate(180deg)' }} /> escolher cliente existente
        </button>
      )}

      <div className="campo duplo">
        <Campo rotulo="Serviço" dica={servico ? `${moeda(servico.preco_centavos)} · ${servico.duracao_min} min` : undefined}>
          <select value={servicoId} onChange={e => setServicoId(e.target.value)}>
            {servicosAtivos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Data" dica={diaDaSemana(data) === 1 || diaDaSemana(data) === 0 ? 'fechamos nesse dia' : 'terça a sábado'}>
          <input type="date" value={data} onChange={e => { setData(e.target.value); setHorario('') }} />
        </Campo>
      </div>

      <Campo
        rotulo={blocos > 1 ? `Horário (ocupa ${blocos} blocos)` : 'Horário'}
        dica={erroDoDia && !editar ? erroDoDia : livres.length ? `${livres.length} de ${SLOTS.length} blocos livres` : 'Dia lotado, escolha outra data.'}
      >
        <div className="chips">
          {SLOTS.map(h => {
            const { pode, motivo } = blocoDisponivel(h)
            return (
              <button key={h} type="button" className={`chip ${horario === h ? 'ativo' : ''}`}
                disabled={!pode} title={!pode ? motivo : h}
                onClick={() => setHorario(h)}>{h}</button>
            )
          })}
        </div>
      </Campo>

      <Campo rotulo="Observação (opcional)">
        <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: degradê baixo, só a nuca, prefere 20h" />
      </Campo>
    </Modal>
  )
}
