import { clienteAdm } from '@/lib/adm'
import { combinaBusca, idValido, termoBusca } from '@/lib/cadastros'
import { filtroPrestadorVisita, filtroStatusVisita, periodoVisitas, type FiltroPrestador, type FiltroStatusVisita } from '@/lib/manutencoes'

export type VisitaLista = {
  id: string
  tipo: string
  numero_visita: number | null
  quantidade_visitas: number | null
  data_programada_atual: string
  status: string
  condominio_nome: string
  prestador_nome: string | null
}

export type EquipamentoDaVisita = {
  nome: string
  resultado: string
  resolvida: boolean | null
  descricao: string | null
  foto: string | null
  ocorrenciaId: string | null
  situacao: string | null
  providencia: string | null
  solucao: string | null
}

export type MovimentoOcorrencia = {
  id: string
  ocorrenciaId: string
  situacaoAnterior: string | null
  situacaoNova: string | null
  observacao: string | null
  autorNome: string | null
  criadoEm: string
}

export type RetornoOcorrencia = {
  id: string
  ocorrenciaId: string
  data: string
  status: string
  prestadorNome: string | null
}

export type VisitaDetalhe = VisitaLista & {
  data_programada_original: string
  contrato_id: string | null
  numero_contrato: string | null
  equipamentos: EquipamentoDaVisita[]
}

export type Reagendamento = {
  id: string
  data_anterior: string
  nova_data: string
  criado_em: string
  autor_nome: string | null
}

type Relacao = { nome: string } | { nome: string }[] | null
type ContratoQuantidade = { quantidade_visitas: number } | { quantidade_visitas: number }[] | null
type ContratoRelacao =
  | { quantidade_visitas: number; numero_contrato: string }
  | { quantidade_visitas: number; numero_contrato: string }[]
  | null

function nomeRelacionado(valor: Relacao) {
  if (!valor) return ''
  if (Array.isArray(valor)) return valor[0]?.nome ?? ''
  return valor.nome ?? ''
}

function primeiroRelacionado<T>(valor: T | T[] | null) {
  if (!valor) return null
  if (Array.isArray(valor)) return valor[0] ?? null
  return valor
}

const LIMITE = 400

export async function listarManutencoes(params: {
  q?: string
  status?: string
  prestador?: string
  de?: string
  ate?: string
}) {
  const termo = termoBusca(params.q)
  const status = filtroStatusVisita(params.status)
  const prestador = filtroPrestadorVisita(params.prestador)
  const periodo = periodoVisitas(params.de, params.ate)
  if (periodo.erro) {
    return {
      erro: periodo.erro,
      linhas: [] as VisitaLista[],
      termo,
      status,
      prestador,
      inicio: periodo.inicio,
      fim: periodo.fim,
      limite: false,
    }
  }

  const supabase = await clienteAdm()
  let consulta = supabase
    .from('manutencoes')
    .select('id, tipo, numero_visita, data_programada_atual, status, prestador_id, condominios(nome), prestadores(nome), contratos(quantidade_visitas)')
    .order('data_programada_atual', { ascending: true })
    .limit(LIMITE)

  if (status !== 'todos') consulta = consulta.eq('status', status)
  if (prestador === 'sem') consulta = consulta.is('prestador_id', null)
  if (prestador !== 'todos' && prestador !== 'sem') consulta = consulta.eq('prestador_id', prestador)
  if (periodo.inicio) consulta = consulta.gte('data_programada_atual', periodo.inicio)
  if (periodo.fim) consulta = consulta.lte('data_programada_atual', periodo.fim)

  const { data, error } = await consulta
  if (error) {
    console.error(error)
    return { erro: 'Não foi possível carregar as manutenções.', linhas: [] as VisitaLista[], termo, status, prestador, inicio: periodo.inicio, fim: periodo.fim, limite: false }
  }

  const linhas = ((data ?? []) as Array<{
    id: string
    tipo: string
    numero_visita: number | null
    data_programada_atual: string
    status: string
    condominios: Relacao
    prestadores: Relacao
    contratos: ContratoQuantidade
  }>)
    .map((linha) => ({
      id: linha.id,
      tipo: linha.tipo,
      numero_visita: linha.numero_visita,
      quantidade_visitas: primeiroRelacionado(linha.contratos)?.quantidade_visitas ?? null,
      data_programada_atual: String(linha.data_programada_atual).slice(0, 10),
      status: linha.status,
      condominio_nome: nomeRelacionado(linha.condominios),
      prestador_nome: nomeRelacionado(linha.prestadores) || null,
    }))
    .filter((linha) => combinaBusca(termo, [linha.condominio_nome]))

  return {
    erro: null,
    linhas,
    termo,
    status,
    prestador,
    inicio: periodo.inicio,
    fim: periodo.fim,
    limite: (data ?? []).length === LIMITE,
  }
}

export async function lerManutencao(id: string) {
  if (!idValido(id)) return null
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('manutencoes')
    .select('id, tipo, numero_visita, data_programada_original, data_programada_atual, status, contrato_id, condominios(nome), prestadores(nome), contratos(quantidade_visitas, numero_contrato), itens_manutencao(nome_identificacao, resultado, ocorrencias(id, status_ocorrencia, providencia, solucao, resolvida_no_local, descricao_original, foto_url))')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null

  const linha = data as {
    id: string
    tipo: string
    numero_visita: number | null
    data_programada_original: string
    data_programada_atual: string
    status: string
    contrato_id: string | null
    condominios: Relacao
    prestadores: Relacao
    contratos: ContratoRelacao
    itens_manutencao: Array<{
      nome_identificacao: string
      resultado: string
      ocorrencias:
        | {
            id: string
            status_ocorrencia: string
            providencia: string | null
            solucao: string | null
            resolvida_no_local: boolean
            descricao_original: string
            foto_url: string
          }
        | {
            id: string
            status_ocorrencia: string
            providencia: string | null
            solucao: string | null
            resolvida_no_local: boolean
            descricao_original: string
            foto_url: string
          }[]
        | null
    }> | null
  }
  const contrato = primeiroRelacionado(linha.contratos)
  const detalhe: VisitaDetalhe = {
    id: linha.id,
    tipo: linha.tipo,
    numero_visita: linha.numero_visita,
    quantidade_visitas: contrato?.quantidade_visitas ?? null,
    data_programada_original: String(linha.data_programada_original).slice(0, 10),
    data_programada_atual: String(linha.data_programada_atual).slice(0, 10),
    status: linha.status,
    contrato_id: linha.contrato_id,
    numero_contrato: contrato?.numero_contrato ?? null,
    condominio_nome: nomeRelacionado(linha.condominios),
    prestador_nome: nomeRelacionado(linha.prestadores) || null,
    equipamentos: (linha.itens_manutencao ?? [])
      .map((item) => {
        const ocorrencia = Array.isArray(item.ocorrencias) ? item.ocorrencias[0] : item.ocorrencias
        return {
          nome: item.nome_identificacao,
          resultado: item.resultado,
          resolvida: ocorrencia ? ocorrencia.resolvida_no_local : null,
          descricao: ocorrencia?.descricao_original ?? null,
          foto: ocorrencia?.foto_url ?? null,
          ocorrenciaId: ocorrencia?.id ?? null,
          situacao: ocorrencia?.status_ocorrencia ?? null,
          providencia: ocorrencia?.providencia ?? null,
          solucao: ocorrencia?.solucao ?? null,
        }
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  }
  return detalhe
}

export async function historicoReagendamentos(manutencaoId: string) {
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('historico_reagendamentos')
    .select('id, data_anterior, nova_data, created_at, usuarios(nome)')
    .eq('manutencao_id', manutencaoId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error(error)
    return { erro: 'Não foi possível carregar o histórico.', linhas: [] as Reagendamento[] }
  }
  const linhas = ((data ?? []) as Array<{
    id: string
    data_anterior: string
    nova_data: string
    created_at: string
    usuarios: Relacao
  }>).map((linha) => ({
    id: linha.id,
    data_anterior: String(linha.data_anterior).slice(0, 10),
    nova_data: String(linha.nova_data).slice(0, 10),
    criado_em: linha.created_at,
    autor_nome: nomeRelacionado(linha.usuarios) || null,
  }))
  return { erro: null, linhas }
}

export async function historicoOcorrencias(ids: string[]) {
  const validos = ids.filter((id) => idValido(id))
  if (validos.length === 0) return { erro: null, linhas: [] as MovimentoOcorrencia[] }
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('historico_ocorrencias')
    .select('id, ocorrencia_id, situacao_anterior, situacao_nova, observacao, created_at, usuarios(nome)')
    .in('ocorrencia_id', validos)
    .order('created_at', { ascending: true })
  if (error) {
    console.error(error)
    return { erro: 'Não foi possível carregar o histórico da ocorrência.', linhas: [] as MovimentoOcorrencia[] }
  }
  const linhas = ((data ?? []) as Array<{
    id: string
    ocorrencia_id: string
    situacao_anterior: string | null
    situacao_nova: string | null
    observacao: string | null
    created_at: string
    usuarios: Relacao
  }>).map((linha) => ({
    id: linha.id,
    ocorrenciaId: linha.ocorrencia_id,
    situacaoAnterior: linha.situacao_anterior,
    situacaoNova: linha.situacao_nova,
    observacao: linha.observacao,
    autorNome: nomeRelacionado(linha.usuarios) || null,
    criadoEm: linha.created_at,
  }))
  return { erro: null, linhas }
}

export async function retornosOcorrencias(ids: string[]) {
  const validos = ids.filter((id) => idValido(id))
  if (validos.length === 0) return { erro: null, linhas: [] as RetornoOcorrencia[] }
  const supabase = await clienteAdm()
  const { data, error } = await supabase
    .from('manutencoes')
    .select('id, ocorrencia_origem_id, data_programada_atual, status, prestadores(nome)')
    .in('ocorrencia_origem_id', validos)
    .order('data_programada_atual', { ascending: true })
  if (error) {
    console.error(error)
    return { erro: 'Não foi possível carregar os retornos.', linhas: [] as RetornoOcorrencia[] }
  }
  const linhas = ((data ?? []) as Array<{
    id: string
    ocorrencia_origem_id: string
    data_programada_atual: string
    status: string
    prestadores: Relacao
  }>).map((linha) => ({
    id: linha.id,
    ocorrenciaId: linha.ocorrencia_origem_id,
    data: String(linha.data_programada_atual).slice(0, 10),
    status: linha.status,
    prestadorNome: nomeRelacionado(linha.prestadores) || null,
  }))
  return { erro: null, linhas }
}

export type { FiltroPrestador, FiltroStatusVisita }
