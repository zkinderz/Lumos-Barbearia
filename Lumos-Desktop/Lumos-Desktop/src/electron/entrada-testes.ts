// Entry para scripts/testa_dados.mjs: expõe os módulos de dados do processo main.
import { criarRepositorioSupabase, testarConexaoSupabase } from './supabase'
import { criarAdaptadorArquivo, copiaSeguranca } from './adaptador-arquivo'
import { criarRepositorioLocal, snapshotInicial } from '../shared/adaptadores'
export { criarRepositorioSupabase, testarConexaoSupabase, criarAdaptadorArquivo, copiaSeguranca, criarRepositorioLocal, snapshotInicial }
