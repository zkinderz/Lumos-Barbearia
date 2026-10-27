import { useEffect, useState } from 'react'
import { api, emDemonstracao } from '../api'
import { useLumos } from '../estado'
import { Cartao, Campo, useAviso } from '../componentes/ui'
import { Icone } from '../componentes/Icones'
import type { ConfigLoja } from '../../shared/types'

interface Conexao { modo: 'local' | 'supabase'; url: string; chave: string; namespace: string }

export function Configuracoes() {
  const { dados, recarregar } = useLumos()
  const avisar = useAviso()
  const [conexao, setConexao] = useState<Conexao>({ modo: 'local', url: '', chave: '', namespace: 'public' })
  const [loja, setLoja] = useState<ConfigLoja>(dados.config)
  const [caminho, setCaminho] = useState<string | null>(null)
  const [testando, setTestando] = useState(false)
  const [resultadoTeste, setResultadoTeste] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    void (async () => {
      const c = await api.conexao()
      if (c) setConexao(c)
      setCaminho(await api.caminhoDados())
    })()
  }, [])
  useEffect(() => setLoja(dados.config), [dados.config])

  async function salvarConexao() {
    const r = await api.salvarConexao(conexao)
    if (!r.ok) return avisar({ tipo: 'erro', titulo: 'Não consegui salvar a conexão', detalhe: r.erro })
    await recarregar()
    avisar({ tipo: 'ok', titulo: conexao.modo === 'supabase' ? 'App aponta para o Supabase' : 'App voltou para o arquivo local' })
  }

  async function testar() {
    setTestando(true); setResultadoTeste(null)
    const r = await api.testarConexao()
    setResultadoTeste(r.ok ? { ok: true, texto: `Conectado. ${r.dados?.clientes ?? 0} cliente(s) na tabela clientes.` } : { ok: false, texto: r.erro ?? 'falha' })
    setTestando(false)
  }

  async function salvarLoja() {
    const r = await api.salvarConfigLoja(loja)
    if (!r.ok) return avisar({ tipo: 'erro', titulo: 'Não salvou', detalhe: r.erro })
    await recarregar()
    avisar({ tipo: 'ok', titulo: 'Dados da barbearia atualizados' })
  }

  const supabasePronto = Boolean(conexao.url && conexao.chave)

  return (
    <div className="grade" style={{ gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', alignItems: 'start' }}>
      <Cartao titulo="De onde vêm os dados">
        <div style={{ padding: 16, display: 'grid', gap: 14 }}>
          {emDemonstracao && (
            <div className="atencao"><Icone.alerta size={15} /> Você está vendo a <b>demonstração no navegador</b> (localStorage). Os controles de conexão funcionam de verdade só no app instalado.</div>
          )}
          <div className="chips">
            <button className={`chip ${conexao.modo === 'local' ? 'ativo' : ''}`} onClick={() => setConexao({ ...conexao, modo: 'local' })}>arquivo no computador</button>
            <button className={`chip ${conexao.modo === 'supabase' ? 'ativo' : ''}`} onClick={() => setConexao({ ...conexao, modo: 'supabase' })}>Supabase (desktop + web + mobile)</button>
          </div>

          {conexao.modo === 'supabase' && (
            <>
              <Campo rotulo="URL do projeto" dica="Settings → API → Project URL (https://xxxx.supabase.co)">
                <input value={conexao.url} onChange={e => setConexao({ ...conexao, url: e.target.value.trim() })} placeholder="https://" spellCheck={false} />
              </Campo>
              <Campo rotulo="Chave de acesso do servidor" dica="Fica criptografada neste computador e nunca vai para a tela do navegador. Use a service_role só aqui.">
                <input type="password" value={conexao.chave} onChange={e => setConexao({ ...conexao, chave: e.target.value })} placeholder="cole quando receber o acesso" spellCheck={false} />
              </Campo>
              <div className="linha">
                <div style={{ width: 110 }}>
                  <Campo rotulo="Schema"><input value={conexao.namespace} onChange={e => setConexao({ ...conexao, namespace: e.target.value || 'public' })} /></Campo>
                </div>
                <button className="btn" onClick={testar} disabled={testando || !conexao.url}>
                  <Icone.nuvem size={14} /> {testando ? 'testando…' : 'testar conexão'}
                </button>
                <button className="btn ouro" onClick={salvarConexao}>aplicar</button>
              </div>
              {resultadoTeste && <div className={`alerta ${resultadoTeste.ok ? 'ok' : ''}`}>{resultadoTeste.texto}</div>}
              <div style={{ display: 'grid', gap: 8, fontSize: 12.5, color: 'var(--texto-2)' }}>
                <div className="linha"><Icone.check size={14} /> <span className="selo sutil">tabelas</span><span><b>clientes</b> · <b>servicos</b> · <b>agendamentos</b> · <b>config_loja</b></span></div>
                <div className="linha"><Icone.check size={14} /> <span className="selo sutil">anti-conflito</span><span>índice <code>unique (data, horario)</code> — o banco decide, não a tela</span></div>
                <div style={{ color: 'var(--texto-3)' }}>Rode <code>migrations/supabase.sql</code> no SQL Editor assim que liberarem o acesso.</div>
              </div>
            </>
          )}

          {conexao.modo === 'local' && (
            <div className="col">
              <div className="dica">Arquivo usado agora:</div>
              <code style={{ fontSize: 12, color: 'var(--ouro-2)', wordBreak: 'break-all' }}>{caminho ?? '…'}</code>
              <div className="dica">Escrita atômica (tmp + rename) e cópia automática antes de trocar de fonte de dados.</div>
            </div>
          )}

          <div className="dica">
            {supabasePronto && conexao.modo === 'supabase'
              ? 'Com o Supabase ativo, o que você marca aqui aparece no site no mesmo segundo (e vice-versa).'
              : 'Enquanto o Supabase não for liberado, o app grava neste computador — nada se perde.'}
          </div>
        </div>
      </Cartao>

      <div className="grade" style={{ gap: 14 }}>
        <Cartao titulo="Dados da barbearia">
          <div style={{ padding: 16, display: 'grid', gap: 14 }}>
            <Campo rotulo="Nome"><input value={loja.nome} onChange={e => setLoja({ ...loja, nome: e.target.value })} /></Campo>
            <Campo rotulo="Endereço" dica="aparece no rodapé do site"><input value={loja.endereco} onChange={e => setLoja({ ...loja, endereco: e.target.value })} placeholder="Rua, número - bairro - cidade/UF" /></Campo>
            <div className="campo duplo">
              <Campo rotulo="WhatsApp" dica="com DDI+DDD, só dígitos (5511...)"><input value={loja.whatsapp} onChange={e => setLoja({ ...loja, whatsapp: e.target.value.replace(/\D/g, '') })} inputMode="tel" /></Campo>
              <Campo rotulo="Comissão (%)" dica="usada no painel"><input type="number" min="0" max="100" value={loja.comissao_pct} onChange={e => setLoja({ ...loja, comissao_pct: Number(e.target.value) })} /></Campo>
            </div>
            <div className="linha"><button className="btn ouro" onClick={salvarLoja}><Icone.check size={15} /> salvar</button></div>
          </div>
        </Cartao>

        <Cartao titulo="Atalhos">
          <div style={{ padding: '12px 16px 16px', display: 'grid', gap: 6, fontSize: 12.5, color: 'var(--texto-2)' }}>
            {[['Ctrl/⌘ + 1', 'Painel de hoje'], ['Ctrl/⌘ + 2', 'Agenda'], ['Ctrl/⌘ + 3', 'Clientes'], ['Ctrl/⌘ + 4', 'Serviços'], ['Ctrl/⌘ + 5', 'Configurações'], ['Ctrl/⌘ + N', 'Nova reserva'], ['Ctrl/⌘ + K', 'Busca rápida']].map(([k, v]) => (
              <div key={k} className="linha"><kbd style={{ minWidth: 92, textAlign: 'center', fontSize: 11, padding: '3px 6px', border: '1px solid var(--linha)', borderRadius: 5 }}>{k}</kbd> {v}</div>
            ))}
          </div>
        </Cartao>

        <Cartao titulo="Resumo da base">
          <div style={{ padding: '12px 16px 18px', fontSize: 12.5, color: 'var(--texto-2)', display: 'grid', gap: 5 }}>
            <div>{dados.clientes.length} clientes · {dados.agendamentos.length} agendamentos · {dados.servicos.filter(s => s.ativo).length} serviços ativos</div>
            <div>{dados.agendamentos.filter(a => a.origem === 'web').length} entraram pelo site; {dados.agendamentos.filter(a => a.origem === 'desktop').length} pelo balcão.</div>
            <div style={{ color: 'var(--texto-3)' }}>Excluir um cliente apaga o cadastro, cancela os horários futuros e mantém o histórico sem nome nem telefone.</div>
          </div>
        </Cartao>
      </div>
    </div>
  )
}
