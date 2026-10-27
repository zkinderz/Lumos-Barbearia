import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icone } from './componentes/Icones'
import { Paleta, type Comando } from './componentes/Paleta'
import { ModalReserva } from './componentes/ModalReserva'
import { useLumos } from './estado'
import { api, emDemonstracao } from './api'
import { Painel } from './telas/Painel'
import { Agenda } from './telas/Agenda'
import { Clientes } from './telas/Clientes'
import { Servicos } from './telas/Servicos'
import { Configuracoes } from './telas/Configuracoes'
import { dataExtenso, hoje, somarDias } from '../shared/rules'
import type { Agendamento } from '../shared/types'

type Tela = 'painel' | 'agenda' | 'clientes' | 'servicos' | 'config'

const TITULOS: Record<Tela, [string, string]> = {
  painel: ['Painel de hoje', 'ocupação, previsão de caixa e a fila do dia'],
  agenda: ['Agenda', 'terça a sábado, blocos de 40 minutos'],
  clientes: ['Clientes', 'cadastro, histórico e dados da LGPD'],
  servicos: ['Serviços', 'preço e duração que o site também usa'],
  config: ['Configurações', 'fonte de dados e dados da barbearia']
}

export function App() {
  const { dados, erro, recarregar } = useLumos()
  const [tela, setTela] = useState<Tela>('painel')
  const [data, setData] = useState(hoje())
  const [paleta, setPaleta] = useState(false)
  const [reserva, setReserva] = useState<{ aberto: boolean; editar?: Agendamento | null; data?: string }>({ aberto: false })
  const [fonte, setFonte] = useState<'local' | 'supabase' | 'demo'>(emDemonstracao ? 'demo' : 'local')

  const abrirReserva = useCallback((d: string, editar?: Agendamento) => {
    setReserva({ aberto: true, editar: editar ?? null, data: d })
  }, [])

  const ir = useCallback((para: string, detalhe?: string) => {
    if (para === 'agenda' && detalhe) { setData(detalhe); setTela('agenda'); return }
    setTela((para as Tela) in TITULOS ? (para as Tela) : 'painel')
  }, [])

  const comandos = useMemo<Comando[]>(() => [
    { id: 'n', rotulo: 'Nova reserva', grupo: 'Ações', atalho: 'Ctrl+N', executar: () => abrirReserva(data) },
    { id: 'p', rotulo: 'Ir para o painel de hoje', grupo: 'Navegar', atalho: 'Ctrl+1', executar: () => setTela('painel') },
    { id: 'a', rotulo: 'Ir para a agenda', grupo: 'Navegar', atalho: 'Ctrl+2', executar: () => setTela('agenda') },
    { id: 'c', rotulo: 'Ir para clientes', grupo: 'Navegar', atalho: 'Ctrl+3', executar: () => setTela('clientes') },
    { id: 's', rotulo: 'Ir para serviços', grupo: 'Navegar', atalho: 'Ctrl+4', executar: () => setTela('servicos') },
    { id: 'k', rotulo: 'Configurações e conexão com o Supabase', grupo: 'Navegar', atalho: 'Ctrl+5', executar: () => setTela('config') },
    { id: 'amanha', rotulo: `Agenda de amanhã (${dataExtenso(somarDias(hoje(), 1))})`, grupo: 'Ações', executar: () => { setData(somarDias(hoje(), 1)); setTela('agenda') } },
    { id: 'r', rotulo: 'Recarregar dados do banco', grupo: 'Ações', executar: () => void recarregar() }
  ], [abrirReserva, data, recarregar])

  useEffect(() => {
    if (emDemonstracao) return                       // no navegador não há arquivo nem Supabase
    void (async () => { const c = await api.conexao(); if (c) setFonte(c.modo) })()
  }, [])

  useEffect(() => api.onAtalho(acao => {
    if (acao === 'acao:buscar') setPaleta(true)
    if (acao === 'acao:nova-reserva') abrirReserva(data)
    if (acao === 'ir:agenda-hoje') { setData(hoje()); setTela('agenda') }
    if (acao === 'ir:semana') setTela('agenda')
    if (acao === 'ir:clientes') setTela('clientes')
    if (acao === 'ir:servicos') setTela('servicos')
    if (acao === 'ir:config') setTela('config')
  }), [abrirReserva, data])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaleta(v => !v) }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  useEffect(() => {
    const achar = (e: Event) => {
      setTela('clientes')
      const id = (e as CustomEvent<string>).detail
      const c = dados.clientes.find(x => x.id === id)
      if (c) window.setTimeout(() => {
        const campo = document.querySelector<HTMLInputElement>('input[placeholder^="nome, telefone"]')
        if (campo) { campo.value = c.nome; campo.dispatchEvent(new Event('input', { bubbles: true })) }
      }, 80)
    }
    window.addEventListener('lumos:abrir-cliente', achar)
    return () => window.removeEventListener('lumos:abrir-cliente', achar)
  }, [dados.clientes])

  const [titulo, sub] = TITULOS[tela]

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="marca">
          <Icone.tesoura size={22} />
          <div>
            <h1>{dados.config.nome || 'Lumos'}</h1>
            <span>banco do balcão</span>
          </div>
        </div>
        <nav className="menu">
          <div className="secao">operação</div>
          <button className={tela === 'painel' ? 'ativo' : ''} onClick={() => setTela('painel')}><Icone.painel size={16} /> Painel <kbd>1</kbd></button>
          <button className={tela === 'agenda' ? 'ativo' : ''} onClick={() => setTela('agenda')}><Icone.agenda size={16} /> Agenda <kbd>2</kbd></button>
          <button className={tela === 'clientes' ? 'ativo' : ''} onClick={() => setTela('clientes')}><Icone.pessoas size={16} /> Clientes <kbd>3</kbd></button>
          <button className={tela === 'servicos' ? 'ativo' : ''} onClick={() => setTela('servicos')}><Icone.etiqueta size={16} /> Serviços <kbd>4</kbd></button>
          <div className="secao">ajuste</div>
          <button className={tela === 'config' ? 'ativo' : ''} onClick={() => setTela('config')}><Icone.ajustes size={16} /> Configurações <kbd>5</kbd></button>
        </nav>
        <div className="rodape-sidebar">
          <button className="btn ouro" style={{ width: '100%' }} onClick={() => abrirReserva(data)}><Icone.mais size={15} /> Nova reserva</button>
          <div className={`fonte ${fonte === 'demo' ? 'demo' : fonte}`} style={{ marginTop: 12 }}
            title={fonte === 'supabase' ? 'lendo e gravando no Supabase' : fonte === 'demo' ? 'rodando no navegador com dados de exemplo' : 'lendo e gravando no arquivo deste computador'}>
            <i /> {fonte === 'supabase' ? 'Supabase conectado' : fonte === 'demo' ? 'demonstração no navegador' : 'arquivo local'}
          </div>
        </div>
      </aside>

      <div className="conteudo">
        <header className="topo">
          <div>
            <h2>{titulo}</h2>
            <div className="sub">{sub}</div>
          </div>
          <div className="espaco" />
          {erro && <span className="selo faltou"><Icone.alerta size={13} /> {erro.slice(0, 60)}</span>}
          <button className="btn" onClick={() => setPaleta(true)}><Icone.buscar size={14} /> buscar <kbd style={{ opacity: .6, fontSize: 10 }}>Ctrl K</kbd></button>
        </header>

        <main className="pagina com-dados">
          {tela === 'painel' && <Painel ir={ir} />}
          {tela === 'agenda' && <Agenda data={data} setData={setData} abrirReserva={abrirReserva} />}
          {tela === 'clientes' && <Clientes />}
          {tela === 'servicos' && <Servicos />}
          {tela === 'config' && <Configuracoes />}
        </main>
      </div>

      <Paleta aberto={paleta} aoFechar={() => setPaleta(false)} extras={comandos} />
      <ModalReserva aberto={reserva.aberto} aoFechar={() => setReserva({ aberto: false })} editar={reserva.editar} dataInicial={reserva.data} />
    </div>
  )
}
