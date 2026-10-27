import { useMemo, useState } from 'react'
import { useLumos } from '../estado'
import { api } from '../api'
import { Cartao, Campo, Modal, useAviso, Vazio } from '../componentes/ui'
import { Icone } from '../componentes/Icones'
import { formatarTelefone, hoje, dataExtenso, validarTelefone } from '../../shared/rules'
import type { Cliente } from '../../shared/types'

const semAcento = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function Clientes() {
  const { dados, recarregar } = useLumos()
  const avisar = useAviso()
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<Partial<Cliente> | null>(null)
  const [form, setForm] = useState({ nome: '', telefone: '', email: '', obs: '' })
  const [erros, setErros] = useState<string[]>([])
  const [confirmarExclusao, setConfirmarExclusao] = useState<Cliente | null>(null)

  const linhas = useMemo(() => {
    const t = semAcento(busca.trim())
    return dados.clientes
      .map(c => {
        const seus = dados.agendamentos.filter(a => a.cliente_id === c.id)
        const futuros = seus.filter(a => a.data >= hoje() && a.status !== 'faltou').sort((x, y) => (x.data + x.horario).localeCompare(y.data + y.horario))
        const passado = seus.filter(a => a.data < hoje() || a.status === 'concluido').sort((x, y) => (y.data + y.horario).localeCompare(x.data + x.horario))
        return { cliente: c, total: seus.length, proximo: futuros[0], ultimo: passado[0], faltas: seus.filter(a => a.status === 'faltou').length }
      })
      .filter(l => !t || semAcento(l.cliente.nome).includes(t) || l.cliente.telefone.includes(t.replace(/\D/g, '')) || (l.cliente.email ?? '').toLowerCase().includes(t))
      .sort((a, b) => a.cliente.nome.localeCompare(b.cliente.nome))
  }, [dados, busca])

  function abrir(c?: Cliente) {
    setErros([])
    setForm(c ? { nome: c.nome, telefone: c.telefone, email: c.email, obs: c.obs ?? '' } : { nome: '', telefone: '', email: '', obs: '' })
    setEditando(c ?? {})
  }

  async function salvar() {
    const mensagens: string[] = []
    if (form.nome.trim().length < 2) mensagens.push('Informe o nome.')
    const { erro } = validarTelefone(form.telefone)
    if (erro) mensagens.push(erro)
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) mensagens.push('E-mail inválido.')
    setErros(mensagens)
    if (mensagens.length) return
    const r = await api.salvarCliente({ ...(editando?.id ? { id: editando.id } : {}), ...form })
    if (!r.ok) { setErros([r.erro ?? 'falha']); return }
    setEditando(null)
    await recarregar()
    avisar({ tipo: 'ok', titulo: editando?.id ? 'Cadastro atualizado' : 'Cliente cadastrado', detalhe: form.nome })
  }

  async function baixar(c: Cliente) {
    const r = await api.exportarCliente(c.id)
    if (!r.ok) return avisar({ tipo: 'erro', titulo: 'Não consegui exportar', detalhe: r.erro })
    const nomeArquivo = `lumos-${semAcento(c.nome).replace(/\s+/g, '-')}.json`
    const blob = new Blob([JSON.stringify(r.dados, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = nomeArquivo; a.click()
    URL.revokeObjectURL(url)
    avisar({ tipo: 'ok', titulo: 'Dados exportados', detalhe: nomeArquivo })
  }

  async function excluir(c: Cliente) {
    const r = await api.excluirCliente(c.id)
    setConfirmarExclusao(null)
    if (!r.ok) return avisar({ tipo: 'erro', titulo: 'Não foi possível excluir', detalhe: r.erro })
    await recarregar()
    avisar({ tipo: 'ok', titulo: 'Conta excluída (LGPD)', detalhe: `${c.nome} · ${r.dados?.cancelados ?? 0} horário(s) futuros liberado(s)` })
  }

  return (
    <Cartao
      titulo={`${dados.clientes.length} clientes na base`}
      acao={<button className="btn ouro mini" onClick={() => abrir()}><Icone.mais size={14} /> novo cliente</button>}
    >
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ position: 'relative' }}>
          <Icone.buscar size={14} style={{ position: 'absolute', left: 11, top: 10, color: 'var(--texto-3)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="nome, telefone ou e-mail" style={{ paddingLeft: 32 }} />
        </div>
      </div>

      {linhas.length === 0
        ? <Vazio texto={busca ? `Nada encontrado para “${busca}”.` : 'Nenhum cliente ainda. Cadastre o primeiro ou espere a reserva chegar pelo site.'} />
        : (
          <div style={{ padding: '10px 0 4px' }}>
            <table className="tabela">
              <thead>
                <tr><th>Cliente</th><th>Telefones</th><th>Reservas</th><th>Próximo</th><th>Último</th><th style={{ textAlign: 'right' }}>Ações</th></tr>
              </thead>
              <tbody>
                {linhas.map(({ cliente, total, proximo, ultimo, faltas }) => (
                  <tr key={cliente.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{cliente.nome}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--texto-3)' }}>
                        {cliente.email || 'sem e-mail'} · {cliente.origem === 'web' ? 'cadastrado no site' : 'balcão'}
                      </div>
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatarTelefone(cliente.telefone)}</td>
                    <td><span className={`selo ${faltas > 2 ? 'faltou' : 'sutil'}`}>{total} {faltas ? `· ${faltas} falta${faltas > 1 ? 's' : ''}` : ''}</span></td>
                    <td style={{ fontSize: 12.5 }}>{proximo ? `${dataExtenso(proximo.data)} ${proximo.horario}` : '—'}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--texto-2)' }}>{ultimo ? `${dataExtenso(ultimo.data)} ${ultimo.horario}` : '—'}</td>
                    <td>
                      <div className="acoes" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn mini fantasma" onClick={() => abrir(cliente)}>editar</button>
                        <button className="btn mini fantasma" onClick={() => baixar(cliente)} title="exportar dados (LGPD)"><Icone.baixar size={13} /></button>
                        <button className="btn mini perigo" onClick={() => setConfirmarExclusao(cliente)}>excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {editando && (
        <Modal titulo={editando.id ? 'Editar cliente' : 'Novo cliente'} aoFechar={() => setEditando(null)}
          rodape={<>
            <button className="btn fantasma" onClick={() => setEditando(null)}>cancelar</button>
            <button className="btn ouro" onClick={salvar}><Icone.check size={15} /> salvar</button>
          </>}>
          {erros.length > 0 && <div className="alerta">{erros.map(e => <div key={e}>{e}</div>)}</div>}
          <Campo rotulo="Nome"><input autoFocus value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></Campo>
          <div className="campo duplo">
            <Campo rotulo="Celular / WhatsApp"><input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} placeholder="(11) 90000-0000" inputMode="tel" /></Campo>
            <Campo rotulo="E-mail (opcional)"><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="cliente@email.com" /></Campo>
          </div>
          <Campo rotulo="Observações" dica="Preferências de corte, alergias, horário favorito">
            <textarea rows={2} value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} />
          </Campo>
        </Modal>
      )}

      {confirmarExclusao && (
        <Modal titulo="Excluir cliente" aoFechar={() => setConfirmarExclusao(null)}
          rodape={<>
            <button className="btn fantasma" onClick={() => setConfirmarExclusao(null)}>manter</button>
            <button className="btn perigo" onClick={() => excluir(confirmarExclusao)}><Icone.x size={15} /> excluir definitivamente</button>
          </>}>
          <p>Isso apaga <b>{confirmarExclusao.nome}</b> do cadastro e cancela os horários futuros dele. O histórico já atendido fica sem nome e telefone (art. 18 da LGPD).</p>
          <p className="dica">Se quiser guardar a cópia antes, use o botão de download na linha do cliente.</p>
        </Modal>
      )}
    </Cartao>
  )
}
