import { clienteAdm } from '@/lib/adm'
import { filtroOu, idValido, situacaoFiltro, termoBusca, type Situacao } from '@/lib/cadastros'

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
  acesso: string | null
}

export type EquipamentoLinha = {
  id: string
  nome: string
  categoria: string
  fabricante: string | null
  modelo: string | null
  ativo: boolean
  observacoes: string | null
}

export type OpcaoAcesso = { valor: string; rotulo: string }

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
  const linhas = ((data ?? []) as PrestadorLinha[]).map((linha) => ({ ...linha, acesso: null, observacoes: null }))
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
  let acesso: string | null = null
  if (data.usuario_id) {
    const { data: usuario } = await supabase.from('usuarios').select('nome, email').eq('id', data.usuario_id).maybeSingle()
    if (usuario) acesso = usuario.email ? `${usuario.nome} — ${usuario.email}` : usuario.nome
  }
  return { ...(data as PrestadorLinha), acesso }
}

export async function opcoesAcesso(prestadorId?: string, usuarioAtual?: string | null) {
  const supabase = await clienteAdm()
  const [{ data: usuarios }, { data: usados }] = await Promise.all([
    supabase.from('usuarios').select('id, nome, email').eq('perfil', 'prestador').order('nome'),
    supabase.from('prestadores').select('id, usuario_id').not('usuario_id', 'is', null),
  ])
  const ocupados = new Set(
    (usados ?? [])
      .filter((item) => item.usuario_id && item.id !== prestadorId)
      .map((item) => item.usuario_id as string),
  )
  const opcoes: OpcaoAcesso[] = ((usuarios ?? []) as Array<{ id: string; nome: string; email: string | null }>)
    .filter((usuario) => !ocupados.has(usuario.id))
    .map((usuario) => ({
      valor: usuario.id,
      rotulo: usuario.email ? `${usuario.nome} — ${usuario.email}` : usuario.nome,
    }))

  if (usuarioAtual && !opcoes.some((opcao) => opcao.valor === usuarioAtual)) {
    const { data } = await supabase.from('usuarios').select('nome, email').eq('id', usuarioAtual).maybeSingle()
    if (data) {
      opcoes.unshift({
        valor: usuarioAtual,
        rotulo: data.email ? `${data.nome} — ${data.email}` : data.nome,
      })
    }
  }

  return opcoes
}

export async function listarEquipamentos(q: string | undefined, situacaoValor: string | undefined) {
  const termo = termoBusca(q)
  const situacao = situacaoFiltro(situacaoValor)
  const supabase = await clienteAdm()
  let consulta = supabase
    .from('equipamentos_matriz')
    .select('id, nome, categoria, fabricante, modelo, ativo')
    .order('nome')
    .limit(200)
  if (situacao === 'ativos') consulta = consulta.eq('ativo', true)
  if (situacao === 'inativos') consulta = consulta.eq('ativo', false)
  if (termo) consulta = consulta.or(filtroOu(['nome', 'categoria', 'fabricante', 'modelo'], termo))

  const { data, error } = await consulta
  if (error) {
    console.error(error)
    return vazio<EquipamentoLinha>(termo, situacao, 'Não foi possível carregar os cadastros.')
  }
  const linhas = ((data ?? []) as EquipamentoLinha[]).map((linha) => ({ ...linha, observacoes: null }))
  return { erro: null, linhas, termo, situacao, limite: linhas.length === 200 }
}

export async function lerEquipamento(id: string) {
  if (!idValido(id)) return null
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('equipamentos_matriz')
    .select('id, nome, categoria, fabricante, modelo, ativo, observacoes')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return data as EquipamentoLinha
}
