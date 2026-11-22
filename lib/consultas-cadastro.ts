import { clienteAdm } from '@/lib/adm'
import {
  combinaBusca,
  filtroOu,
  idValido,
  limiteMatriz,
  situacaoFiltro,
  situacaoMatriz,
  termoBusca,
  type Situacao,
  type SugestaoPessoaSindico,
} from '@/lib/cadastros'

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

export type PessoaSindicoLista = {
  id: string
  nome: string
  whatsapp: string | null
  email: string | null
  vinculos: {
    id: string
    condominioId: string
    condominioNome: string
    dataInicio: string | null
    dataFim: string | null
    ativo: boolean
  }[]
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
  pessoa_id?: string
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

export type DestinatarioLinha = {
  id: string
  papel: string
  complemento: string | null
  nome: string
  whatsapp: string | null
  email: string | null
  data_inicio: string
  data_fim: string | null
  ativo: boolean
}

export async function destinatariosDoCondominio(condominioId: string) {
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('destinatarios_comprovante')
    .select('id, papel, complemento, nome, whatsapp, email, data_inicio, data_fim, ativo')
    .eq('condominio_id', condominioId)
    .order('ativo', { ascending: false })
    .order('data_inicio', { ascending: false })
  if (error) {
    return { estado: 'indisponivel' as const, linhas: [] as DestinatarioLinha[], ativo: null }
  }
  const linhas = (data ?? []) as DestinatarioLinha[]
  return { estado: 'ok' as const, linhas, ativo: linhas.find((linha) => linha.ativo) ?? null }
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

type PeriodoPessoa = {
  id: string
  condominio_id: string
  data_inicio: string | null
  data_fim: string | null
  ativo: boolean
  condominios: { nome: string } | { nome: string }[] | null
}

function vinculosDaPessoa(periodos: PeriodoPessoa[] | PeriodoPessoa | null) {
  const lista = Array.isArray(periodos) ? periodos : periodos ? [periodos] : []
  return lista
    .map((periodo) => ({
      id: periodo.id,
      condominioId: periodo.condominio_id,
      condominioNome: nomeRelacionado(periodo.condominios),
      dataInicio: periodo.data_inicio,
      dataFim: periodo.data_fim,
      ativo: periodo.ativo,
    }))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || (b.dataInicio ?? '').localeCompare(a.dataInicio ?? ''))
}

function pessoaCombina(pessoa: PessoaSindicoLista, termo: string) {
  if (!termo) return true
  const digitos = termo.replace(/\D/g, '')
  const zap = (pessoa.whatsapp ?? '').replace(/\D/g, '')
  return (
    combinaBusca(termo, [pessoa.nome, pessoa.whatsapp, pessoa.email, ...pessoa.vinculos.map((vinculo) => vinculo.condominioNome)]) ||
    (digitos.length >= 2 && zap.includes(digitos))
  )
}

export async function consultarPessoasSindico(termoBruto: string): Promise<SugestaoPessoaSindico[]> {
  const termo = termoBusca(termoBruto)
  const digitos = termo.replace(/\D/g, '')
  if (termo.length < 2 && digitos.length < 2) return []
  const supabase = await clienteAdm()
  const seguro = termo.replace(/"/g, '')
  const partes: string[] = []
  if (seguro.length >= 2) partes.push(`nome.ilike."%${seguro}%"`)
  if (digitos.length >= 2) partes.push(`whatsapp.ilike."%${digitos}%"`)
  const { data, error } = await supabase
    .from('sindico_pessoas')
    .select('id, nome, whatsapp, email, sindicos(id, condominio_id, data_inicio, data_fim, ativo, condominios(nome))')
    .or(partes.join(','))
    .limit(40)
  if (error) {
    console.error(error)
    return []
  }
  return ((data ?? []) as Array<{
    id: string
    nome: string
    whatsapp: string | null
    email: string | null
    sindicos: PeriodoPessoa[] | PeriodoPessoa | null
  }>)
    .map((pessoa) => {
      const vinculos = vinculosDaPessoa(pessoa.sindicos)
      return {
        id: pessoa.id,
        nome: pessoa.nome,
        whatsapp: pessoa.whatsapp,
        email: pessoa.email,
        ativos: [...new Set(vinculos.filter((vinculo) => vinculo.ativo).map((vinculo) => vinculo.condominioNome))],
        historico: [...new Set(vinculos.filter((vinculo) => !vinculo.ativo).map((vinculo) => vinculo.condominioNome))],
      }
    })
    .slice(0, 8)
}

export async function listarSindicos(q: string | undefined, situacaoValor: string | undefined) {
  const termo = termoBusca(q)
  const situacao = situacaoFiltro(situacaoValor)
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('sindico_pessoas')
    .select('id, nome, whatsapp, email, sindicos(id, condominio_id, data_inicio, data_fim, ativo, condominios(nome))')
    .order('nome')
  if (error) {
    console.error(error)
    return { erro: 'Não foi possível carregar os cadastros.', pessoas: [] as PessoaSindicoLista[], termo, situacao, limite: false }
  }

  const pessoas = ((data ?? []) as Array<{
    id: string
    nome: string
    whatsapp: string | null
    email: string | null
    sindicos: PeriodoPessoa[] | PeriodoPessoa | null
  }>)
    .map((pessoa) => ({
      id: pessoa.id,
      nome: pessoa.nome,
      whatsapp: pessoa.whatsapp,
      email: pessoa.email,
      vinculos: vinculosDaPessoa(pessoa.sindicos),
    }))
    .filter((pessoa) => pessoa.vinculos.length > 0)
    .filter((pessoa) => {
      if (situacao === 'ativos') return pessoa.vinculos.some((vinculo) => vinculo.ativo)
      if (situacao === 'inativos') return pessoa.vinculos.every((vinculo) => !vinculo.ativo)
      return true
    })
    .filter((pessoa) => pessoaCombina(pessoa, termo))

  return {
    erro: null,
    pessoas: pessoas.slice(0, 200),
    termo,
    situacao,
    limite: pessoas.length > 200,
  }
}

export async function lerSindico(condominioId: string, sindicoId: string) {
  if (!idValido(condominioId) || !idValido(sindicoId)) return null
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('sindicos')
    .select('id, nome, whatsapp, email, data_inicio, data_fim, ativo, pessoa_id, condominio_id, condominios(nome)')
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
