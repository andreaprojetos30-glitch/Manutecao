import { clienteAdm } from '@/lib/adm'
import { combinaBusca, idValido, termoBusca } from '@/lib/cadastros'
import { situacaoContrato, statusDaSituacao, type SituacaoContrato, type StatusContrato } from '@/lib/contratos'

export type ContratoLista = {
  id: string
  numero_contrato: string
  condominio_nome: string
  quantidade_visitas: number
  data_inicio_manutencao: string
  status: StatusContrato
}

export type ContratoDetalhe = {
  id: string
  numero_contrato: string
  condominio_id: string
  condominio_nome: string
  data_inicio_contrato: string
  data_fim_contrato: string | null
  data_inicio_manutencao: string
  quantidade_visitas: number
  prestador_padrao_id: string | null
  prestador_nome: string | null
  status: StatusContrato
  programacao_gerada: boolean
}

export type EquipamentoDoContrato = {
  id: string
  equipamento_matriz_id: string
  matriz_nome: string
  identificacao: string | null
  nome_identificacao: string
}

export type VisitaDoContrato = {
  id: string
  numero_visita: number
  data_programada_atual: string
  data_realizada: string | null
  status: string
  registro_anterior: boolean
  tem_execucao: boolean
  prestador_nome: string | null
  equipamentos: string[]
}

export type OpcaoNome = {
  id: string
  nome: string
  ativo: boolean
}

type Relacao = { nome: string } | { nome: string }[] | null

function nomeRelacionado(valor: Relacao) {
  if (!valor) return ''
  if (Array.isArray(valor)) return valor[0]?.nome ?? ''
  return valor.nome ?? ''
}

function statusContrato(valor: string): StatusContrato {
  if (valor === 'encerrado' || valor === 'cancelado') return valor
  return 'ativo'
}

export async function listarContratos(q: string | undefined, situacaoValor: string | undefined) {
  const termo = termoBusca(q)
  const alvo = termo.replace(/^contrato\s+/i, '')
  const situacao = situacaoContrato(situacaoValor)
  const supabase = await clienteAdm()
  let consulta = supabase
    .from('contratos')
    .select('id, numero_contrato, quantidade_visitas, data_inicio_manutencao, status, created_at, condominios(nome)')
    .order('created_at', { ascending: false })
    .limit(200)
  const status = statusDaSituacao(situacao)
  if (status) consulta = consulta.eq('status', status)

  const { data, error } = await consulta
  if (error) {
    console.error(error)
    return { erro: 'Não foi possível carregar os contratos.', linhas: [] as ContratoLista[], termo, situacao, limite: false }
  }

  const linhas = ((data ?? []) as Array<{
    id: string
    numero_contrato: string
    quantidade_visitas: number
    data_inicio_manutencao: string
    status: string
    condominios: Relacao
  }>)
    .map((linha) => ({
      id: linha.id,
      numero_contrato: linha.numero_contrato,
      condominio_nome: nomeRelacionado(linha.condominios),
      quantidade_visitas: linha.quantidade_visitas,
      data_inicio_manutencao: linha.data_inicio_manutencao,
      status: statusContrato(linha.status),
    }))
    .filter((linha) => combinaBusca(alvo, [linha.numero_contrato, linha.condominio_nome]))

  return { erro: null, linhas, termo, situacao, limite: (data ?? []).length === 200 }
}

export async function contratosDoCondominio(condominioId: string) {
  if (!idValido(condominioId)) return { erro: null, linhas: [] as ContratoLista[] }
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('contratos')
    .select('id, numero_contrato, quantidade_visitas, data_inicio_manutencao, status')
    .eq('condominio_id', condominioId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error(error)
    return { erro: 'Não foi possível carregar os contratos.', linhas: [] as ContratoLista[] }
  }
  const linhas = ((data ?? []) as Array<Omit<ContratoLista, 'condominio_nome'>>).map((linha) => ({
    ...linha,
    condominio_nome: '',
    status: statusContrato(linha.status),
  }))
  return { erro: null, linhas }
}

export async function lerContrato(id: string) {
  if (!idValido(id)) return null
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('contratos')
    .select('id, numero_contrato, condominio_id, data_inicio_contrato, data_fim_contrato, data_inicio_manutencao, quantidade_visitas, prestador_padrao_id, status, condominios(nome), prestadores(nome)')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null

  const { count } = await supabase
    .from('manutencoes')
    .select('id', { count: 'exact', head: true })
    .eq('contrato_id', id)
    .eq('tipo', 'preventiva')
    .eq('origem', 'automatica')

  const linha = data as {
    id: string
    numero_contrato: string
    condominio_id: string
    data_inicio_contrato: string
    data_fim_contrato: string | null
    data_inicio_manutencao: string
    quantidade_visitas: number
    prestador_padrao_id: string | null
    status: string
    condominios: Relacao
    prestadores: Relacao
  }

  const detalhe: ContratoDetalhe = {
    id: linha.id,
    numero_contrato: linha.numero_contrato,
    condominio_id: linha.condominio_id,
    condominio_nome: nomeRelacionado(linha.condominios),
    data_inicio_contrato: linha.data_inicio_contrato,
    data_fim_contrato: linha.data_fim_contrato,
    data_inicio_manutencao: linha.data_inicio_manutencao,
    quantidade_visitas: linha.quantidade_visitas,
    prestador_padrao_id: linha.prestador_padrao_id,
    prestador_nome: nomeRelacionado(linha.prestadores) || null,
    status: statusContrato(linha.status),
    programacao_gerada: (count ?? 0) > 0,
  }
  return detalhe
}

export async function equipamentosDoContrato(contratoId: string) {
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('equipamentos_contrato')
    .select('id, equipamento_matriz_id, nome_identificacao, identificacao, ativo, created_at, equipamentos_matriz(nome)')
    .eq('contrato_id', contratoId)
  if (error) {
    console.error(error)
    return { erro: 'Não foi possível carregar os equipamentos.', linhas: [] as EquipamentoDoContrato[] }
  }
  const linhas = ((data ?? []) as Array<{
    id: string
    equipamento_matriz_id: string
    nome_identificacao: string
    identificacao: string | null
    ativo: boolean
    created_at: string
    equipamentos_matriz: Relacao
  }>)
    .filter((linha) => linha.ativo)
    .map((linha) => ({
      id: linha.id,
      equipamento_matriz_id: linha.equipamento_matriz_id,
      matriz_nome: nomeRelacionado(linha.equipamentos_matriz) || linha.nome_identificacao,
      identificacao: linha.identificacao?.trim() ? linha.identificacao.trim() : null,
      nome_identificacao: linha.nome_identificacao,
      created_at: linha.created_at,
    }))
    .sort((a, b) => {
      const nome = a.matriz_nome.localeCompare(b.matriz_nome, 'pt-BR', { sensitivity: 'base' })
      if (nome !== 0) return nome
      const ident = (a.identificacao ?? '').localeCompare(b.identificacao ?? '', 'pt-BR', { sensitivity: 'base' })
      if (ident !== 0) return ident
      return a.created_at.localeCompare(b.created_at)
    })
    .map((linha) => ({
      id: linha.id,
      equipamento_matriz_id: linha.equipamento_matriz_id,
      matriz_nome: linha.matriz_nome,
      identificacao: linha.identificacao,
      nome_identificacao: linha.nome_identificacao,
    }))
  return { erro: null, linhas }
}

export async function visitasDoContrato(contratoId: string) {
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('manutencoes')
    .select('id, numero_visita, data_programada_atual, data_realizada, status, registro_anterior, prestadores(nome), itens_manutencao(nome_identificacao, resultado)')
    .eq('contrato_id', contratoId)
    .eq('tipo', 'preventiva')
    .eq('origem', 'automatica')
    .order('numero_visita')
  if (error) {
    console.error(error)
    return { erro: 'Não foi possível carregar a programação.', linhas: [] as VisitaDoContrato[] }
  }
  const linhas = ((data ?? []) as Array<{
    id: string
    numero_visita: number | null
    data_programada_atual: string
    data_realizada: string | null
    status: string
    registro_anterior: boolean
    prestadores: Relacao
    itens_manutencao: { nome_identificacao: string; resultado: string }[] | null
  }>).map((linha) => ({
    id: linha.id,
    numero_visita: linha.numero_visita ?? 0,
    data_programada_atual: linha.data_programada_atual.slice(0, 10),
    data_realizada: linha.data_realizada ? linha.data_realizada.slice(0, 10) : null,
    status: linha.status,
    registro_anterior: linha.registro_anterior === true,
    tem_execucao: (linha.itens_manutencao ?? []).some((item) => item.resultado !== 'pendente'),
    prestador_nome: nomeRelacionado(linha.prestadores) || null,
    equipamentos: (linha.itens_manutencao ?? [])
      .map((item) => item.nome_identificacao)
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  }))
  return { erro: null, linhas }
}

export async function opcoesCondominio() {
  const supabase = await clienteAdm()
  const { data, error } = await supabase.from('condominios').select('id, nome, ativo').order('nome').limit(300)
  if (error) return [] as OpcaoNome[]
  return ((data ?? []) as OpcaoNome[]).sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'))
}

export async function opcoesPrestador(atualId: string | null) {
  const supabase = await clienteAdm()
  const { data, error } = await supabase.from('prestadores').select('id, nome, ativo').order('nome').limit(300)
  if (error) return [] as OpcaoNome[]
  return ((data ?? []) as OpcaoNome[]).filter((item) => item.ativo || item.id === atualId)
}

export async function matrizAtiva() {
  const supabase = await clienteAdm()
  const linhas: OpcaoNome[] = []
  const pagina = 1000
  for (let inicio = 0; inicio < 20000; inicio += pagina) {
    const { data, error } = await supabase
      .from('equipamentos_matriz')
      .select('id, nome, ativo')
      .eq('ativo', true)
      .order('nome')
      .range(inicio, inicio + pagina - 1)
    if (error) {
      console.error(error)
      return { erro: 'Não foi possível carregar os equipamentos.', linhas: [] as OpcaoNome[] }
    }
    const lote = (data ?? []) as OpcaoNome[]
    linhas.push(...lote)
    if (lote.length < pagina) break
  }
  linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
  return { erro: null, linhas }
}

export type { SituacaoContrato }
