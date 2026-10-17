import { exigirPrestadorOperando } from '@/lib/sessao'
import { createClient } from '@/lib/supabase/server'
import { idValido } from '@/lib/cadastros'

export type VisitaPrestador = {
  id: string
  tipo: string
  numero_visita: number | null
  quantidade_visitas: number | null
  data_programada_atual: string
  status: string
  condominio_nome: string
  equipamentos: number
  verificados: number
}

export type OcorrenciaItem = {
  resolvida: boolean
  descricao: string
  foto: string
}

export type ItemExecucao = {
  id: string
  nome: string
  resultado: string
  ocorrencia: OcorrenciaItem | null
}

export type VisitaExecucao = VisitaPrestador & {
  editavel: boolean
  itens: ItemExecucao[]
}

type Relacao = { nome: string } | { nome: string }[] | null
type ContratoRelacao = { quantidade_visitas: number } | { quantidade_visitas: number }[] | null
type OcorrenciaBruta = {
  resolvida_no_local: boolean
  descricao_original: string
  foto_url: string
}

const LIMITE = 500

function nomeRelacionado(valor: Relacao) {
  if (!valor) return ''
  if (Array.isArray(valor)) return valor[0]?.nome ?? ''
  return valor.nome ?? ''
}

function quantidadeContrato(valor: ContratoRelacao) {
  if (!valor) return null
  if (Array.isArray(valor)) return valor[0]?.quantidade_visitas ?? null
  return valor.quantidade_visitas
}

function ocorrenciaDe(valor: OcorrenciaBruta | OcorrenciaBruta[] | null) {
  const linha = Array.isArray(valor) ? valor[0] : valor
  if (!linha) return null
  return {
    resolvida: linha.resolvida_no_local,
    descricao: linha.descricao_original,
    foto: linha.foto_url,
  }
}

export async function clientePrestador() {
  await exigirPrestadorOperando()
  return createClient()
}

export async function acessoExecucao() {
  const supabase = await clientePrestador()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ativo: false, supabase }

  const { data } = await supabase
    .from('prestadores')
    .select('ativo')
    .eq('usuario_id', user.id)
    .maybeSingle()

  return { ativo: data?.ativo === true, supabase }
}

export async function listarVisitasPrestador() {
  const acesso = await acessoExecucao()
  if (!acesso.ativo) {
    return { ativo: false, erro: null, linhas: [] as VisitaPrestador[], limite: false }
  }

  const { data, error } = await acesso.supabase
    .from('manutencoes')
    .select('id, tipo, numero_visita, data_programada_atual, status, condominios(nome), contratos(quantidade_visitas), itens_manutencao(id, resultado)')
    .eq('registro_anterior', false)
    .order('data_programada_atual', { ascending: true })
    .limit(LIMITE)

  if (error) {
    console.error(error)
    return { ativo: true, erro: 'Não foi possível carregar as manutenções.', linhas: [] as VisitaPrestador[], limite: false }
  }

  const linhas = ((data ?? []) as Array<{
    id: string
    tipo: string
    numero_visita: number | null
    data_programada_atual: string
    status: string
    condominios: Relacao
    contratos: ContratoRelacao
    itens_manutencao: { id: string; resultado: string }[] | null
  }>).map((linha) => {
    const itens = linha.itens_manutencao ?? []
    return {
      id: linha.id,
      tipo: linha.tipo,
      numero_visita: linha.numero_visita,
      quantidade_visitas: quantidadeContrato(linha.contratos),
      data_programada_atual: String(linha.data_programada_atual).slice(0, 10),
      status: linha.status,
      condominio_nome: nomeRelacionado(linha.condominios),
      equipamentos: itens.length,
      verificados: itens.filter((item) => item.resultado === 'ok' || item.resultado === 'ocorrencia').length,
    }
  })

  return { ativo: true, erro: null, linhas, limite: (data ?? []).length === LIMITE }
}

export async function lerVisitaPrestador(id: string) {
  if (!idValido(id)) return { ativo: true, visita: null as VisitaExecucao | null }
  const acesso = await acessoExecucao()
  if (!acesso.ativo) return { ativo: false, visita: null }

  const { data, error } = await acesso.supabase
    .from('manutencoes')
    .select('id, tipo, numero_visita, data_programada_atual, registro_anterior, status, condominios(nome), contratos(quantidade_visitas), itens_manutencao(id, nome_identificacao, resultado, ocorrencias(resolvida_no_local, descricao_original, foto_url))')
    .eq('registro_anterior', false)
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return { ativo: true, visita: null }

  const linha = data as {
    id: string
    tipo: string
    numero_visita: number | null
    data_programada_atual: string
    status: string
    condominios: Relacao
    contratos: ContratoRelacao
    itens_manutencao: Array<{
      id: string
      nome_identificacao: string
      resultado: string
      ocorrencias: OcorrenciaBruta | OcorrenciaBruta[] | null
    }> | null
  }
  const itens = (linha.itens_manutencao ?? [])
    .map((item) => ({
      id: item.id,
      nome: item.nome_identificacao,
      resultado: item.resultado,
      ocorrencia: ocorrenciaDe(item.ocorrencias),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const visita: VisitaExecucao = {
    id: linha.id,
    tipo: linha.tipo,
    numero_visita: linha.numero_visita,
    quantidade_visitas: quantidadeContrato(linha.contratos),
    data_programada_atual: String(linha.data_programada_atual).slice(0, 10),
    status: linha.status,
    condominio_nome: nomeRelacionado(linha.condominios),
    equipamentos: itens.length,
    verificados: itens.filter((item) => item.resultado === 'ok' || item.resultado === 'ocorrencia').length,
    editavel: linha.status === 'programada' || linha.status === 'em_execucao',
    itens,
  }
  return { ativo: true, visita }
}
