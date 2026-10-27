import fs from 'node:fs'
import path from 'node:path'
import type { Snapshot } from '../shared/types'
import { snapshotInicial, type AdaptadorBruto } from '../shared/adaptadores'

/** Arquivo JSON no diretório de dados do app, com escrita atômica
 *  (temp + rename): falta de energia no meio da gravação não corrompe a agenda. */
export function criarAdaptadorArquivo(caminho: string): AdaptadorBruto {
  return {
    carregar() {
      try {
        return JSON.parse(fs.readFileSync(caminho, 'utf-8')) as Snapshot
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error('[lumos] não consegui ler o arquivo de dados, começando vazio:', e)
          try { fs.renameSync(caminho, `${caminho}.${Date.now()}.corrompido`) } catch { /* melhor esforço */ }
        }
        return snapshotInicial()
      }
    },
    salvar(s: Snapshot) {
      fs.mkdirSync(path.dirname(caminho), { recursive: true })
      const tmp = `${caminho}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf-8')
      fs.renameSync(tmp, caminho)
    }
  }
}

/** Cópia do estado atual antes de qualquer sincronização com o Supabase. */
export function copiaSeguranca(caminho: string): string | null {
  try {
    if (!fs.existsSync(caminho)) return null
    const destino = path.join(path.dirname(caminho), 'backup', `${path.basename(caminho, '.json')}-${new Date().toISOString().slice(0, 10)}.json`)
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.copyFileSync(caminho, destino)
    return destino
  } catch (e) {
    console.error('[lumos] falha na cópia de segurança:', e)
    return null
  }
}
