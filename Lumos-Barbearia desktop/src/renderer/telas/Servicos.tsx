import { useState } from 'react'
import { useLumos } from '../estado'
import { api } from '../api'
import { Cartao, Campo, Modal, InlineEdit, useAviso } from '../componentes/ui'
import { Icone } from '../componentes/Icones'
import { moeda, slotsNecessarios, SLOTS } from '../../shared/rules'
import type { Servico } from '../../shared/types'

export function Servicos() {
  const { dados, recarregar } = useLumos()
  const avisar = useAviso()
  const [novo, setNovo] = useState<Servico | null>(null)
  const [form, setForm] = useState({ nome: '', descricao: '', preco: '45', duracao: '40', ativo: true })
  const [erros, setErros] = useState<string[]>([])

  function abrir(s?: Servico) {
    setErros([])
    setNovo(s ?? ({} as Servico))
    setForm(s
      ? { nome: s.nome, descricao: s.descricao, preco: String(s.preco_centavos / 100), duracao: String(s.duracao_min), ativo: s.ativo }
      : { nome: '', descricao: '', preco: '45', duracao: '40', ativo: true })
  }

  async function salvar() {
    const preco = Math.round(Number(form.preco.replace(',', '.')) * 100)
    const duracao = Number(form.duracao)
    const mensagens: string[] = []
    if (form.nome.trim().length < 2) mensagens.push('Dê um nome ao serviço.')
    if (!Number.isFinite(preco) || preco <= 0) mensagens.push('Preço inválido.')
    if (!(duracao >= 10 && duracao <= 240)) mensagens.push('A duração fica entre 10 e 240 minutos.')
    setErros(mensagens)
    if (mensagens.length) return
    const r = await api.salvarServico({
      ...(novo?.id ? { id: novo.id } : {}), nome: form.nome, descricao: form.descricao,
      preco_centavos: preco, duracao_min: duracao, ativo: form.ativo
    })
    if (!r.ok) { setErros([r.erro ?? 'falha']); return }
    setNovo(null)
    await recarregar()
    avisar({ tipo: 'ok', titulo: 'Cardápio atualizado', detalhe: `${form.nome} · ${moeda(preco)}` })
  }

  async function ligar(s: Servico, ativo: boolean) {
    const r = await api.alternarServico(s.id, ativo)
    if (!r.ok) return avisar({ tipo: 'erro', titulo: 'Não deu', detalhe: r.erro })
    await recarregar()
    avisar({ tipo: 'ok', titulo: ativo ? 'Serviço volt ao cardápio' : 'Serviço pausado', detalhe: s.nome })
  }

  const uso = (id: string): number => dados.agendamentos.filter(a => a.servico_id === id).length

  return (
    <Cartao titulo="Cardápio (o site lê os mesmos preços)" acao={<button className="btn ouro mini" onClick={() => abrir()}><Icone.mais size={14} /> novo serviço</button>}>
      <div style={{ padding: 16, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(292px, 1fr))' }}>
        {dados.servicos.map(s => (
          <div key={s.id} className="painel" style={{ padding: 14, opacity: s.ativo ? 1 : 0.55 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.nome}</div>
                <div style={{ fontSize: 12, color: 'var(--texto-3)', minHeight: 32 }}>{s.descricao}</div>
              </div>
              <span className="selo sutil">{uso(s.id)}×</span>
            </div>
            <div className="linha" style={{ marginTop: 8, flexWrap: 'wrap' }}>
              <InlineEdit valor={s.preco_centavos / 100} tipo="number" largura={110} formatar={v => moeda(Math.round(Number(v) * 100))}
                aoSalvar={async v => {
                  const r = await api.salvarServico({ id: s.id, nome: s.nome, descricao: s.descricao, preco_centavos: Math.round(Number(v) * 100), duracao_min: s.duracao_min, ativo: s.ativo })
                  if (!r.ok) return avisar({ tipo: 'erro', titulo: 'Preço não salvo', detalhe: r.erro })
                  await recarregar(); avisar({ tipo: 'ok', titulo: 'Preço atualizado', detalhe: `${s.nome} · ${moeda(Math.round(Number(v) * 100))}` })
                }} />
              <span style={{ fontSize: 12, color: 'var(--texto-2)' }}>
                <InlineEdit valor={s.duracao_min} tipo="number" largura={54} sufixo="min"
                  aoSalvar={async v => {
                    const r = await api.salvarServico({ id: s.id, nome: s.nome, descricao: s.descricao, preco_centavos: s.preco_centavos, duracao_min: Number(v), ativo: s.ativo })
                    if (!r.ok) return avisar({ tipo: 'erro', titulo: 'Duração não salva', detalhe: r.erro })
                    await recarregar()
                  }} />
                {' · '}ocupa {slotsNecessarios(s)} de {SLOTS.length} blocos
              </span>
              <div style={{ marginLeft: 'auto' }} className="linha">
                <button className="btn mini fantasma" onClick={() => ligar(s, !s.ativo)}>{s.ativo ? 'pausar' : 'reativar'}</button>
                <button className="btn mini" onClick={() => abrir(s)}>editar</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {novo !== null && (
        <Modal titulo={novo.id ? 'Editar serviço' : 'Novo serviço'} aoFechar={() => setNovo(null)}
          rodape={<>
            <button className="btn fantasma" onClick={() => setNovo(null)}>cancelar</button>
            <button className="btn ouro" onClick={salvar}><Icone.check size={15} /> salvar</button>
          </>}>
          {erros.length > 0 && <div className="alerta">{erros.map(e => <div key={e}>{e}</div>)}</div>}
          <Campo rotulo="Nome"><input autoFocus value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Barba + toalha quente" /></Campo>
          <Campo rotulo="Descrição (aparece no site)"><textarea rows={2} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></Campo>
          <div className="campo duplo">
            <Campo rotulo="Preço (R$)"><input type="number" min="0" step="0.5" value={form.preco} onChange={e => setForm({ ...form, preco: e.target.value })} /></Campo>
            <Campo rotulo="Duração (min)" dica="acima de 40 min ocupa mais de um bloco da agenda">
              <input type="number" min="10" max="240" step="10" value={form.duracao} onChange={e => setForm({ ...form, duracao: e.target.value })} />
            </Campo>
          </div>
          <label className="linha" style={{ fontSize: 12.5 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} />
            visível no site e no balcão
          </label>
        </Modal>
      )}
    </Cartao>
  )
}
