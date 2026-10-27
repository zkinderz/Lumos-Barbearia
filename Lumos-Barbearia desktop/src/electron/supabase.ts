import type { Agendamento, Cliente, ConfigLoja, Servico, Snapshot } from '../shared/types'
import type { Repositorio, Resultado } from '../shared/repositorio'
import { hoje } from '../shared/rules'

/** Configuração do modo de dados. A chave do Supabase é um segredo: nunca vai
 *  para o renderer, fica só no processo main (e criptografada quando o SO permite). */
export interface ConfigApp {
  modo: 'local' | 'supabase'
  url: string
  chave: string
  namespace: string
}

export const CONFIG_PADRAO: ConfigApp = { modo: 'local', url: '', chave: '', namespace: 'public' }

/* ------------------------------------------------------------------ tipos -- */
/** Linha como vem do Postgres. Os nomes batem com migrations/supabase.sql,
 *  que é o mesmo contrato usado pelo site (depois de plugar o Supabase nele). */
interface LinhaAgendamento {
  id: string
  cliente_id: string
  servico_id: string
  data: string
  horario: string
  status: Agendamento['status']
  origem: 'desktop' | 'web'
  obs: string | null
  criado_em: string
}
interface LinhaCliente {
  id: string; nome: string; telefone: string; email: string; obs: string | null
  aceite_lgpd_versao: string | null; criado_em: string
}
interface LinhaServico {
  id: string; nome: string; descricao: string; preco_centavos: number
  duracao_min: number; ativo: boolean; ordem: number
}

const okR = <T,>(dados?: T): Resultado<T> => ({ ok: true, dados })
const erroR = (e: unknown): Resultado<never> => ({ ok: false, erro: e instanceof Error ? e.message : String(e) })

function paraAgendamento(l: LinhaAgendamento): Agendamento {
  return {
    id: l.id, cliente_id: l.cliente_id, servico_id: l.servico_id, data: l.data, horario: l.horario,
    status: l.status, origem: l.origem, obs: l.obs ?? undefined, criado_em: l.criado_em
  }
}
function paraCliente(l: LinhaCliente): Cliente {
  return {
    id: l.id, nome: l.nome, telefone: l.telefone, email: l.email, obs: l.obs ?? undefined,
    aceite_lgpd_versao: l.aceite_lgpd_versao, origem: 'desktop', criado_em: l.criado_em
  }
}
function paraServico(l: LinhaServico): Servico {
  return { id: l.id, nome: l.nome, descricao: l.descricao, preco_centavos: l.preco_centavos, duracao_min: l.duracao_min, ativo: l.ativo }
}

/** Traduz erro 23505 (unique violation) do Postgres em mensagem de negócio. */
function erroDeConflito(resposta: Response, texto: string): string {
  if (resposta.status === 409 || /duplicate key value|unique|_data_horario_key/i.test(texto)) {
    return 'Este horário acabou de ser reservado em outro dispositivo. Atualize a agenda.'
  }
  if (resposta.status === 401 || resposta.status === 403) {
    return 'Acesso recusado pelo Supabase: confira a chave e as políticas de linha (RLS).'
  }
  return `Supabase (${resposta.status}): ${texto.slice(0, 200)}`
}

/* --------------------------------------------------------------- cliente --- */
/** Repositorio no PostgREST do Supabase (fetch puro, sem SDK: menos dependência
 *  nativa no pacote e o mesmo contrato REST que o site vai usar). */
export function criarRepositorioSupabase(cfg: ConfigApp): Repositorio {
  const base = `${cfg.url.replace(/\/$/, '')}/rest/v1`
  const cabecalhos = (extra: Record<string, string> = {}): Record<string, string> => ({
    apikey: cfg.chave,
    Authorization: `Bearer ${cfg.chave}`,
    'Content-Type': 'application/json',
    ...extra
  })

  async function pedir<T>(rota: string, inicia: RequestInit, contexto: string): Promise<{ dados?: T; erro?: string; status: number }> {
    let resposta: Response
    try {
      resposta = await fetch(`${base}${rota}`, { ...inicia, headers: cabecalhos(inicia.headers as Record<string, string>) })
    } catch (e) {
      return { erro: `Sem conexão com o Supabase (${(e as Error).message}). O app continua offline até a rede voltar.`, status: 0 }
    }
    const texto = await resposta.text()
    if (!resposta.ok) return { erro: erroDeConflito(resposta, texto), status: resposta.status }
    if (!texto) return { dados: undefined as T, status: resposta.status }
    try {
      return { dados: JSON.parse(texto) as T, status: resposta.status }
    } catch {
      return { erro: `${contexto}: resposta ilegível do Supabase.`, status: resposta.status }
    }
  }

  const carregarTudo = async (): Promise<Resultado<Snapshot>> => {
    const [clientes, servicos, agendamentos, config] = await Promise.all([
      pedir<LinhaCliente[]>('/clientes?select=*&order=nome.asc', { method: 'GET' }, 'clientes'),
      pedir<LinhaServico[]>('/servicos?select=*&order=ordem.asc', { method: 'GET' }, 'servicos'),
      pedir<LinhaAgendamento[]>('/agendamentos?select=*&order=data.asc,horario.asc', { method: 'GET' }, 'agendamentos'),
      pedir<{ chave: string; valor: unknown }[]>('/config_loja?select=chave,valor', { method: 'GET' }, 'config')
    ])
    const erro = clientes.erro ?? servicos.erro ?? agendamentos.erro ?? config.erro
    if (erro) return { ok: false, erro }
    const loja: ConfigLoja = { nome: 'Lumos Barbearia', endereco: '', whatsapp: '', comissao_pct: 30 }
    for (const linha of config.dados ?? []) {
      if (linha.chave in loja) Object.assign(loja, { [linha.chave]: linha.valor })
    }
    return okR({
      clientes: (clientes.dados ?? []).map(paraCliente),
      servicos: (servicos.dados ?? []).map(paraServico),
      agendamentos: (agendamentos.dados ?? []).map(paraAgendamento),
      config: loja
    })
  }

  return {
    snapshot: async () => {
      const r = await carregarTudo()
      if (!r.ok || !r.dados) throw new Error(r.erro ?? 'falha ao carregar')
      return r.dados
    },

    async criarAgendamento(i) {
      const corpo = {
        cliente_id: i.cliente_id, servico_id: i.servico_id, data: i.data, horario: i.horario,
        status: 'pendente', origem: i.origem ?? 'desktop', obs: i.obs?.trim() || null
      }
      const r = await pedir<LinhaAgendamento[]>('/agendamentos?select=*', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify([corpo])
      }, 'criar agendamento')
      if (r.erro) return { ok: false, erro: r.erro }
      const criado = (r.dados ?? [])[0]
      return okR(criado ? paraAgendamento(criado) : {
        id: crypto.randomUUID(), cliente_id: corpo.cliente_id, servico_id: corpo.servico_id, data: corpo.data,
        horario: corpo.horario, status: 'pendente', origem: 'desktop', obs: corpo.obs ?? undefined, criado_em: new Date().toISOString()
      })
    },

    async remarcarAgendamento(id, data, horario) {
      const r = await pedir<LinhaAgendamento[]>(`/agendamentos?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data, horario, status: 'pendente' })
      }, 'remarcar')
      if (r.erro) return { ok: false, erro: r.erro }
      const linha = (r.dados ?? [])[0]
      if (!linha) return { ok: false, erro: 'Agendamento não encontrado.' }
      return okR(paraAgendamento(linha))
    },

    async mudarStatusAgendamento(id, status) {
      const r = await pedir<LinhaAgendamento[]>(`/agendamentos?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status })
      }, 'mudar status')
      if (r.erro) return { ok: false, erro: r.erro }
      const linha = (r.dados ?? [])[0]
      if (!linha) return { ok: false, erro: 'Agendamento não encontrado.' }
      return okR(paraAgendamento(linha))
    },

    async removerAgendamento(id) {
      const r = await pedir(`/agendamentos?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }, 'cancelar')
      return r.erro ? { ok: false, erro: r.erro } : okR()
    },

    async salvarCliente(i) {
      const corpo = {
        nome: i.nome.trim(), telefone: i.telefone.replace(/\D/g, ''), email: (i.email || '').toLowerCase().trim() || null,
        obs: i.obs?.trim() || null, aceite_lgpd_versao: 'balcao'
      }
      if (i.id) {
        const r = await pedir<LinhaCliente[]>(`/clientes?id=eq.${encodeURIComponent(i.id)}&select=*`, {
          method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(corpo)
        }, 'atualizar cliente')
        if (r.erro) return { ok: false, erro: r.erro }
        const linha = (r.dados ?? [])[0]
        return linha ? okR(paraCliente(linha)) : { ok: false, erro: 'Cliente não encontrado.' }
      }
      const r = await pedir<LinhaCliente[]>('/clientes?select=*', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...corpo, criado_em: new Date().toISOString() })
      }, 'criar cliente')
      if (r.erro) return { ok: false, erro: r.erro }
      const linha = (r.dados ?? [])[0]
      if (!linha) return { ok: false, erro: 'O Supabase não confirmou a criação do cliente.' }
      return okR(paraCliente(linha))
    },

    async excluirCliente(id) {
      const futuros = await pedir<LinhaAgendamento[]>(
        `/agendamentos?cliente_id=eq.${encodeURIComponent(id)}&data=gte.${hoje()}&select=id`,
        { method: 'GET' }, 'agendamentos futuros')
      if (futuros.erro) return { ok: false, erro: futuros.erro }
      const ids = (futuros.dados ?? []).map(a => a.id)
      if (ids.length) {
        const apagados = await pedir(`/agendamentos?id=in.(${ids.map(encodeURIComponent).join(',')})`, { method: 'DELETE' }, 'cancelar futuros')
        if (apagados.erro) return { ok: false, erro: apagados.erro }
      }
      const anonima = await pedir(`/agendamentos?cliente_id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', body: JSON.stringify({ cliente_id: null, obs: 'cliente removido a pedido' })
      }, 'anonimizar histórico')
      if (anonima.erro) return { ok: false, erro: anonima.erro }
      const r = await pedir(`/clientes?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }, 'excluir cliente')
      return r.erro ? { ok: false, erro: r.erro } : okR({ cancelados: ids.length })
    },

    async exportarCliente(id) {
      const [cli, ag] = await Promise.all([
        pedir<LinhaCliente[]>(`/clientes?id=eq.${encodeURIComponent(id)}&select=*`, { method: 'GET' }, 'cliente'),
        pedir<LinhaAgendamento[]>(`/agendamentos?cliente_id=eq.${encodeURIComponent(id)}&select=*&order=data.asc`, { method: 'GET' }, 'histórico')
      ])
      if (cli.erro) return { ok: false, erro: cli.erro }
      const cliente = (cli.dados ?? [])[0]
      if (!cliente) return { ok: false, erro: 'Cliente não encontrado.' }
      const servicos = await pedir<LinhaServico[]>('/servicos?select=id,nome', { method: 'GET' }, 'servicos')
      const nomes = new Map((servicos.dados ?? []).map(s => [s.id, s.nome]))
      return okR({
        cliente: paraCliente(cliente),
        agendamentos: (ag.dados ?? []).map(a => ({
          data: a.data, horario: a.horario, status: a.status, origem: a.origem,
          servico: nomes.get(a.servico_id) ?? '—'
        })),
        gerado_em: new Date().toISOString()
      })
    },

    async salvarServico(i) {
      const corpo = {
        nome: i.nome.trim(), descricao: i.descricao.trim(), preco_centavos: Math.round(i.preco_centavos),
        duracao_min: i.duracao_min, ativo: i.ativo
      }
      if (i.id) {
        const r = await pedir<LinhaServico[]>(`/servicos?id=eq.${encodeURIComponent(i.id)}&select=*`, {
          method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(corpo)
        }, 'atualizar serviço')
        if (r.erro) return { ok: false, erro: r.erro }
        const linha = (r.dados ?? [])[0]
        return linha ? okR(paraServico(linha)) : { ok: false, erro: 'Serviço não encontrado.' }
      }
      const contagem = await pedir<LinhaServico[]>('/servicos?select=ordem', { method: 'GET' }, 'contar')
      const r = await pedir<LinhaServico[]>('/servicos?select=*', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ ...corpo, ordem: (contagem.dados ?? []).length })
      }, 'criar serviço')
      if (r.erro) return { ok: false, erro: r.erro }
      const linha = (r.dados ?? [])[0]
      if (!linha) return { ok: false, erro: 'O Supabase não confirmou a criação do serviço.' }
      return okR(paraServico(linha))
    },

    async alternarServico(id, ativo) {
      const r = await pedir<LinhaServico[]>(`/servicos?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ativo })
      }, 'alternar serviço')
      if (r.erro) return { ok: false, erro: r.erro }
      const linha = (r.dados ?? [])[0]
      if (!linha) return { ok: false, erro: 'Serviço não encontrado.' }
      return okR(paraServico(linha))
    },

    async salvarConfig(c) {
      const linhas = Object.entries(c).map(([chave, valor]) => ({ chave, valor }))
      const r = await pedir('/config_loja?on_conflict=chave', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(linhas)
      }, 'salvar dados da loja')
      return r.erro ? { ok: false, erro: r.erro } : okR(c)
    }
  }
}

/** Ping leve usado pelo botão "testar conexão". */
export async function testarConexaoSupabase(cfg: ConfigApp): Promise<Resultado<{ clientes: number }>> {
  const repo = criarRepositorioSupabase(cfg)
  try {
    const s = await repo.snapshot()
    return okR({ clientes: s.clientes.length })
  } catch (e) {
    return erroR(e)
  }
}
