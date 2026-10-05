import { clienteAdm } from '@/lib/adm'
import { filtroOu, idValido, limiteMatriz, situacaoFiltro, situacaoMatriz, termoBusca, type Situacao } from '@/lib/cadastros'

export type CondominioLista = {
  id: string
  nome: string
  bairro: string
  cidade: string
  estado: string
  ativo: boolean
}

export type CondominioDetalhe = CondominioLista & {
  cep: string | null
  endereco: string
  numero: string | null
  complemento: string | null
  quantidade_unidades: number | null
  observacoes: string | null
}

export type SindicoLinha = {
  id: string
  nome: string
  whatsapp: string | null
  email: string | null
  data_inicio: string | null
  data_fim: string | null
  ativo: boolean
  condominio_id: string
  condominio_nome: string
}

export type PrestadorLinha = {
  id: string
  nome: string
  whatsapp: string
  email: string | null
  usuario_id: string | null
  ativo: boolean
  observacoes: string | null
}

export type EquipamentoLinha = {
  id: string
  nome: string
  ativo: boolean
}

type Resultado<T> = {
  erro: string | null
  linhas: T[]
  termo: string
  situacao: Situacao
  limite: boolean
}

function vazio<T>(termo: string, situacao: Situacao, erro: string | null = null): Resultado<T> {
  return { erro, linhas: [], termo, situacao, limite: false }
}

function nomeRelacionado(valor: { nome: string } | { nome: string }[] | null) {
  if (!valor) return ''
  if (Array.isArray(valor)) return valor[0]?.nome ?? ''
  return valor.nome ?? ''
}

export async function listarCondominios(q: string | undefined, situacaoValor: string | undefined) {
  const termo = termoBusca(q)
  const situacao = situacaoFiltro(situacaoValor)
  const supabase = await clienteAdm()
  let consulta = supabase.from('condominios').select('id, nome, bairro, cidade, estado, ativo').order('nome').limit(200)
  if (situacao === 'ativos') consulta = consulta.eq('ativo', true)
  if (situacao === 'inativos') consulta = consulta.eq('ativo', false)
  if (termo) consulta = consulta.or(filtroOu(['nome', 'cidade', 'bairro'], termo))

  const { data, error } = await consulta
  if (error) {
    console.error(error)
    return vazio<CondominioLista>(termo, situacao, 'Não foi possível carregar os cadastros.')
  }
  const linhas = (data ?? []) as CondominioLista[]
  return { erro: null, linhas, termo, situacao, limite: linhas.length === 200 }
}

export async function lerCondominio(id: string) {
  if (!idValido(id)) return null
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('condominios')
    .select('id, nome, cep, endereco, numero, complemento, bairro, cidade, estado, quantidade_unidades, ativo, observacoes')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return data as CondominioDetalhe
}

export async function sindicosDoCondominio(condominioId: string) {
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('sindicos')
    .select('id, nome, whatsapp, email, data_inicio, data_fim, ativo')
    .eq('condominio_id', condominioId)
    .order('ativo', { ascending: false })
    .order('data_inicio', { ascending: false })
  if (error) {
    console.error(error)
    return [] as SindicoLinha[]
  }
  return (data ?? []) as Omit<SindicoLinha, 'condominio_id' | 'condominio_nome'>[]
}

export async function listarSindicos(q: string | undefined, situacaoValor: string | undefined) {
  const termo = termoBusca(q)
  const situacao = situacaoFiltro(situacaoValor)
  const supabase = await clienteAdm()
  let consulta = supabase
    .from('sindicos')
    .select('id, nome, whatsapp, data_inicio, data_fim, ativo, condominio_id, condominios(nome)')
    .order('nome')
  if (situacao === 'ativos') consulta = consulta.eq('ativo', true)
  if (situacao === 'inativos') consulta = consulta.eq('ativo', false)

  const { data, error } = await consulta
  if (error) {
    console.error(error)
    return vazio<SindicoLinha>(termo, situacao, 'Não foi possível carregar os cadastros.')
  }

  const alvo = termo.toLocaleLowerCase('pt-BR')
  const linhas = ((data ?? []) as Array<Omit<SindicoLinha, 'condominio_nome'> & { condominios: { nome: string } | { nome: string }[] | null }>)
    .map((linha) => ({
      id: linha.id,
      nome: linha.nome,
      whatsapp: linha.whatsapp,
      email: linha.email,
      data_inicio: linha.data_inicio,
      data_fim: linha.data_fim,
      ativo: linha.ativo,
      condominio_id: linha.condominio_id,
      condominio_nome: nomeRelacionado(linha.condominios),
    }))
    .filter((linha) => {
      if (!alvo) return true
      return linha.nome.toLocaleLowerCase('pt-BR').includes(alvo) || linha.condominio_nome.toLocaleLowerCase('pt-BR').includes(alvo)
    })

  return {
    erro: null,
    linhas: linhas.slice(0, 200),
    termo,
    situacao,
    limite: linhas.length > 200,
  }
}

export async function lerSindico(condominioId: string, sindicoId: string) {
  if (!idValido(condominioId) || !idValido(sindicoId)) return null
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('sindicos')
    .select('id, nome, whatsapp, email, data_inicio, data_fim, ativo, condominio_id, condominios(nome)')
    .eq('id', sindicoId)
    .maybeSingle()
  if (error || !data || data.condominio_id !== condominioId) return null
  const linha = data as Omit<SindicoLinha, 'condominio_nome'> & { condominios: { nome: string } | { nome: string }[] | null }
  return { ...linha, condominio_nome: nomeRelacionado(linha.condominios) }
}

export async function listarPrestadores(q: string | undefined, situacaoValor: string | undefined) {
  const termo = termoBusca(q)
  const situacao = situacaoFiltro(situacaoValor)
  const supabase = await clienteAdm()
  let consulta = supabase.from('prestadores').select('id, nome, whatsapp, email, usuario_id, ativo').order('nome').limit(200)
  if (situacao === 'ativos') consulta = consulta.eq('ativo', true)
  if (situacao === 'inativos') consulta = consulta.eq('ativo', false)
  if (termo) consulta = consulta.or(filtroOu(['nome', 'whatsapp'], termo))

  const { data, error } = await consulta
  if (error) {
    console.error(error)
    return vazio<PrestadorLinha>(termo, situacao, 'Não foi possível carregar os cadastros.')
  }
  const linhas = ((data ?? []) as PrestadorLinha[]).map((linha) => ({ ...linha, observacoes: null }))
  return { erro: null, linhas, termo, situacao, limite: linhas.length === 200 }
}

export async function lerPrestador(id: string) {
  if (!idValido(id)) return null
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('prestadores')
    .select('id, nome, whatsapp, email, usuario_id, ativo, observacoes')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return data as PrestadorLinha
}

export async function listarEquipamentos(q: string | undefined, situacaoValor: string | undefined, limiteValor?: string) {
  const termo = termoBusca(q)
  const situacao = situacaoMatriz(situacaoValor)
  const limite = limiteMatriz(limiteValor)
  const supabase = await clienteAdm()
  let consulta = supabase
    .from('equipamentos_matriz')
    .select('id, nome, ativo', { count: 'exact' })
    .order('nome', { ascending: true })
    .limit(limite)
  if (situacao === 'ativos') consulta = consulta.eq('ativo', true)
  if (situacao === 'inativos') consulta = consulta.eq('ativo', false)
  if (termo) consulta = consulta.or(filtroOu(['nome'], termo))

  const { data, error, count } = await consulta
  if (error) {
    console.error(error)
    return { erro: 'Não foi possível carregar os cadastros.', linhas: [] as EquipamentoLinha[], termo, situacao, total: 0, limite, temMais: false }
  }
  const linhas = (data ?? []) as EquipamentoLinha[]
  const total = count ?? linhas.length
  return { erro: null, linhas, termo, situacao, total, limite, temMais: total > linhas.length }
}

export async function lerEquipamento(id: string) {
  if (!idValido(id)) return null
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('equipamentos_matriz')
    .select('id, nome, ativo')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return data as EquipamentoLinha
}
