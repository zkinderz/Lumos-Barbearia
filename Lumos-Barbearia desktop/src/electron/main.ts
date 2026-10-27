import { app, BrowserWindow, ipcMain, Menu, safeStorage, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { criarRepositorioLocal, type AdaptadorBruto } from '../shared/adaptadores'
import { criarAdaptadorArquivo, copiaSeguranca } from './adaptador-arquivo'
import { criarRepositorioSupabase, testarConexaoSupabase, CONFIG_PADRAO, type ConfigApp } from './supabase'
import type { Repositorio, Resultado } from '../shared/repositorio'
import type { Snapshot } from '../shared/types'

/** O app funciona 100% sem Supabase (arquivo local). Ao apontar para o Supabase,
 *  a mesma interface passa a ir no Postgres dele. Chave nunca vai ao renderer. */

const EM_DEV = !app.isPackaged
const ARQUIVO_CONFIG = () => path.join(app.getPath('userData'), 'conexao.json')
const ARQUIVO_DADOS = () => path.join(app.getPath('userData'), 'lumos-dados.json')

function lerConfig(): ConfigApp {
  try {
    const bruto = JSON.parse(fs.readFileSync(ARQUIVO_CONFIG(), 'utf-8')) as Record<string, string>
    const cifrada = bruto.chave ?? ''
    let chave = ''
    if (cifrada && safeStorage.isEncryptionAvailable()) {
      try { chave = safeStorage.decryptString(Buffer.from(cifrada, 'base64')) } catch { chave = '' }
    } else if (cifrada) {
      chave = Buffer.from(cifrada, 'base64').toString('utf-8')
    }
    return { ...CONFIG_PADRAO, ...bruto, chave }
  } catch {
    return { ...CONFIG_PADRAO }
  }
}

function gravarConfig(c: ConfigApp): void {
  const gravar: Record<string, string> = { ...c, chave: '' } as Record<string, string>
  if (c.chave) {
    gravar.chave = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(c.chave).toString('base64')
      : Buffer.from(c.chave, 'utf-8').toString('base64')
  }
  fs.mkdirSync(path.dirname(ARQUIVO_CONFIG()), { recursive: true })
  fs.writeFileSync(ARQUIVO_CONFIG(), JSON.stringify(gravar, null, 2), 'utf-8')
}

let config = CONFIG_PADRAO
let repositorio: Repositorio

/** adaptador "arquivo" com escrita local; quando o modo é supabase o arquivo
 *  vira espelho de leitura para o caso de cair a rede (o app avisa, não perde). */
function montarRepositorio(): void {
  const adaptador: AdaptadorBruto = criarAdaptadorArquivo(ARQUIVO_DADOS())
  const local = criarRepositorioLocal(adaptador)
  if (config.modo === 'supabase' && config.url && config.chave) {
    repositorio = criarRepositorioSupabase(config)
  } else {
    repositorio = local
  }
  if (config.modo === 'supabase') copiaSeguranca(ARQUIVO_DADOS())
}

/** Todo canal devolve UM Resultado (sem segundo embrulho): assim um erro de
 *  regra — horário tomado, dia fechado, rede caída — chega na tela como erro. */
async function seguro<T>(fn: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await fn()
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

function registrarIpc(): void {
  ipcMain.handle('snapshot', () => seguro(async (): Promise<Resultado<Snapshot>> => ({ ok: true, dados: await repositorio.snapshot() })))
  ipcMain.handle('criar-agendamento', (_e, i) => seguro(() => repositorio.criarAgendamento(i)))
  ipcMain.handle('remarcar-agendamento', (_e, p) => seguro(() => repositorio.remarcarAgendamento(p.id, p.data, p.horario)))
  ipcMain.handle('mudar-status', (_e, p) => seguro(() => repositorio.mudarStatusAgendamento(p.id, p.status)))
  ipcMain.handle('remover-agendamento', (_e, id) => seguro(() => repositorio.removerAgendamento(id)))
  ipcMain.handle('salvar-cliente', (_e, i) => seguro(() => repositorio.salvarCliente(i)))
  ipcMain.handle('excluir-cliente', (_e, id) => seguro(() => repositorio.excluirCliente(id)))
  ipcMain.handle('exportar-cliente', (_e, id) => seguro(() => repositorio.exportarCliente(id)))
  ipcMain.handle('salvar-servico', (_e, i) => seguro(() => repositorio.salvarServico(i)))
  ipcMain.handle('alternar-servico', (_e, p) => seguro(() => repositorio.alternarServico(p.id, p.ativo)))
  ipcMain.handle('salvar-config-loja', (_e, c) => seguro(() => repositorio.salvarConfig(c)))

  ipcMain.handle('conexao-obter', () => ({ ...config, chave: config.chave ? '•'.repeat(8) : '' }))
  ipcMain.handle('conexao-salvar', (_e, nova: ConfigApp & { chave?: string }) => {
    const chave = nova.chave && !/^•+$/.test(nova.chave) ? nova.chave : config.chave
    config = { ...config, ...nova, chave }
    try {
      gravarConfig(config)
      montarRepositorio()
      return { ok: true, dados: { modo: config.modo } }
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : 'não foi possível gravar a conexão' }
    }
  })
  ipcMain.handle('conexao-testar', () =>
    seguro(async (): Promise<Resultado<{ clientes: number }>> => {
      if (!config.url || !config.chave) return { ok: false, erro: 'Preencha a URL do projeto e a chave de acesso.' }
      return testarConexaoSupabase(config)
    }))

  ipcMain.handle('dados-arquivo', () => seguro(async (): Promise<Resultado<{ caminho: string }>> => ({ ok: true, dados: { caminho: ARQUIVO_DADOS() } })))
  ipcMain.handle('abril-caminho', async (_e, caminho: string) => shell.showItemInFolder(caminho))
}

function atalhos(janela: BrowserWindow): void {
  const model = (rotulo: string, acelerador: string, emitir: string) => ({
    label: rotulo, accelerator: acelerador, click: () => janela.webContents.send('atalho', emitir)
  })
  const menu = Menu.buildFromTemplate([
    {
      label: 'Lumos',
      submenu: [
        model('Agenda de hoje', 'CmdOrCtrl+1', 'ir:agenda-hoje'),
        model('Semana', 'CmdOrCtrl+2', 'ir:semana'),
        model('Clientes', 'CmdOrCtrl+3', 'ir:clientes'),
        model('Serviços', 'CmdOrCtrl+4', 'ir:servicos'),
        model('Configurações', 'CmdOrCtrl+5', 'ir:config'),
        { type: 'separator' },
        model('Nova reserva', 'CmdOrCtrl+N', 'acao:nova-reserva'),
        model('Busca rápida', 'CmdOrCtrl+K', 'acao:buscar'),
        { type: 'separator' },
        { role: 'reload', label: 'Recarregar' },
        { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' },
        { role: 'quit', label: 'Sair' }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)
}

function criarJanela(): BrowserWindow {
  const janela = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    backgroundColor: '#0f1114',
    title: 'Lumos Barbearia',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  janela.once('ready-to-show', () => janela.show())
  janela.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (EM_DEV) janela.loadURL('http://localhost:5173')
  else janela.loadFile(path.join(__dirname, '../dist/index.html'))
  atalhos(janela)
  return janela
}

const instancias = app.requestSingleInstanceLock()
if (!instancias) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const janela = BrowserWindow.getAllWindows()[0]
    if (janela) { janela.focus(); if (janela.isMinimized()) janela.restore() }
  })
  app.whenReady().then(() => {
    config = lerConfig()
    montarRepositorio()
    registrarIpc()
    criarJanela()
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) criarJanela() })
  })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
