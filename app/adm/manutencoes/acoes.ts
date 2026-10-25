'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { clienteAdm } from '@/lib/adm'
import { idValido } from '@/lib/cadastros'
import { normalizarObservacaoAdministracao } from '@/lib/comprovante'
import { adaptarBucket, integrarComprovante, type LeitorComprovante } from '@/lib/comprovante-liberacao'
import { mensagemManutencao, validarAvulsa, validarReagendamento } from '@/lib/manutencoes'
import { validarDependeOrcamento, validarRetorno, validarTratamento } from '@/lib/ocorrencias'

export type EstadoForm = { erro: string }

function texto(formData: FormData, campo: string) {
  return String(formData.get(campo) ?? '')
}

async function liberarComprovanteDaVisita(visitaId: string, autorizar: boolean, observacao: string | null) {
  const supabase = await clienteAdm()
  const liberacao = await integrarComprovante(
    supabase as unknown as LeitorComprovante,
    adaptarBucket(supabase),
    visitaId,
    autorizar,
    observacao,
  )
  if (liberacao.erro) return { erro: mensagemManutencao(liberacao.erro), situacao: liberacao.situacao }
  return { erro: null as string | null, situacao: liberacao.situacao }
}

function atualizar(id?: string) {
  revalidatePath('/adm/manutencoes')
  revalidatePath('/prestador')
  if (id) revalidatePath(`/adm/manutencoes/${id}`)
}

export async function reagendarVisita(formData: FormData) {
  const id = texto(formData, 'id').trim()
  const atual = texto(formData, 'data_atual').slice(0, 10)
  const data = texto(formData, 'data').slice(0, 10)
  const caminho = idValido(id) ? `/adm/manutencoes/${id}` : '/adm/manutencoes'
  if (!idValido(id)) redirect(`${caminho}?erro=${encodeURIComponent('Visita não encontrada.')}`)
  const erro = validarReagendamento(data, atual)
  if (erro) redirect(`${caminho}?erro=${encodeURIComponent(erro)}`)

  const supabase = await clienteAdm()
  const { error } = await supabase.rpc('reagendar_visita', { p_id: id, p_data: data })
  if (error) redirect(`${caminho}?erro=${encodeURIComponent(mensagemManutencao(error.message))}`)
  atualizar(id)
  redirect(`${caminho}?salvo=reagendada`)
}

export async function criarManutencaoAvulsa(_estado: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const matrizes = formData.getAll('matriz_id').map((valor) => String(valor).trim()).filter(Boolean)
  const validado = validarAvulsa({
    condominioId: texto(formData, 'condominio_id').trim(),
    data: texto(formData, 'data').slice(0, 10),
    prestadorId: texto(formData, 'prestador_id').trim(),
    matrizes,
  })
  if (validado.erro || !validado.dados) return { erro: validado.erro ?? 'Não foi possível salvar.' }

  const supabase = await clienteAdm()
  const { data, error } = await supabase.rpc('criar_manutencao_avulsa', {
    p_condominio_id: validado.dados.condominioId,
    p_data: validado.dados.data,
    p_prestador_id: validado.dados.prestadorId,
    p_matrizes: validado.dados.matrizes,
  })
  if (error || typeof data !== 'string' || !idValido(data)) return { erro: mensagemManutencao(error?.message ?? '') }
  atualizar(data)
  redirect(`/adm/manutencoes/${data}?salvo=avulsa`)
}

export async function registrarTratamentoOcorrencia(formData: FormData) {
  const visitaId = texto(formData, 'visita_id').trim()
  const ocorrenciaId = texto(formData, 'ocorrencia_id').trim()
  const caminho = idValido(visitaId) ? `/adm/manutencoes/${visitaId}` : '/adm/manutencoes'
  const validado = validarTratamento(texto(formData, 'situacao'), texto(formData, 'observacao'))
  const orcamento = validarDependeOrcamento(texto(formData, 'depende_orcamento'), texto(formData, 'exige_orcamento') === 'sim')
  if (!idValido(ocorrenciaId) || validado.erro || !validado.dados || orcamento.erro) {
    redirect(`${caminho}?erro=${encodeURIComponent(orcamento.erro ?? validado.erro ?? 'Ocorrência não encontrada.')}`)
  }

  const supabase = await clienteAdm()
  const { error } = await supabase.rpc('registrar_tratamento_ocorrencia', {
    p_ocorrencia: ocorrenciaId,
    p_situacao: validado.dados.situacao,
    p_observacao: validado.dados.observacao,
    p_depende_orcamento: orcamento.depende,
  })
  if (error) redirect(`${caminho}?erro=${encodeURIComponent(mensagemManutencao(error.message))}`)
  const liberacao = await liberarComprovanteDaVisita(visitaId, false, null)
  atualizar(visitaId)
  if (liberacao.erro) redirect(`${caminho}?erro=${encodeURIComponent(liberacao.erro)}`)
  if (liberacao.situacao === 'liberada') redirect(`${caminho}?salvo=comprovante`)
  if (liberacao.situacao === 'autorizar') redirect(`${caminho}?salvo=pendencia`)
  redirect(`${caminho}?salvo=tratamento`)
}

async function concluirLiberacao(formData: FormData, autorizar: boolean) {
  const visitaId = texto(formData, 'visita_id').trim()
  const caminho = idValido(visitaId) ? `/adm/manutencoes/${visitaId}` : '/adm/manutencoes'
  if (!idValido(visitaId)) redirect(`${caminho}?erro=${encodeURIComponent('Visita não encontrada.')}`)
  const observacao = normalizarObservacaoAdministracao(texto(formData, 'observacao_administracao'), autorizar)
  if (observacao.erro) redirect(`${caminho}?erro=${encodeURIComponent(observacao.erro)}`)
  const liberacao = await liberarComprovanteDaVisita(visitaId, autorizar, observacao.observacao)
  atualizar(visitaId)
  if (liberacao.erro) redirect(`${caminho}?erro=${encodeURIComponent(liberacao.erro)}`)
  if (liberacao.situacao !== 'liberada') {
    redirect(`${caminho}?erro=${encodeURIComponent(mensagemManutencao(
      autorizar ? 'Esta manutenção não aguarda autorização do comprovante' : 'Esta manutenção não gera comprovante',
    ))}`)
  }
  redirect(`${caminho}?salvo=comprovante`)
}

export async function autorizarLiberacaoComprovante(formData: FormData) {
  await concluirLiberacao(formData, true)
}

export async function armazenarLiberacaoComprovante(formData: FormData) {
  await concluirLiberacao(formData, false)
}

export async function programarRetornoOcorrencia(formData: FormData) {
  const visitaId = texto(formData, 'visita_id').trim()
  const ocorrenciaId = texto(formData, 'ocorrencia_id').trim()
  const caminho = idValido(visitaId) ? `/adm/manutencoes/${visitaId}` : '/adm/manutencoes'
  const validado = validarRetorno(texto(formData, 'data').slice(0, 10), texto(formData, 'prestador_id').trim())
  if (!idValido(ocorrenciaId) || validado.erro || !validado.dados) {
    redirect(`${caminho}?erro=${encodeURIComponent(validado.erro ?? 'Ocorrência não encontrada.')}`)
  }

  const supabase = await clienteAdm()
  const { data, error } = await supabase.rpc('programar_retorno_ocorrencia', {
    p_ocorrencia: ocorrenciaId,
    p_data: validado.dados.data,
    p_prestador: validado.dados.prestadorId,
  })
  if (error || typeof data !== 'string' || !idValido(data)) {
    redirect(`${caminho}?erro=${encodeURIComponent(mensagemManutencao(error?.message ?? ''))}`)
  }
  atualizar(visitaId)
  atualizar(data)
  redirect(`${caminho}?salvo=retorno`)
}

export async function excluirManutencaoAvulsa(formData: FormData) {
  const id = texto(formData, 'id').trim()
  const caminho = idValido(id) ? `/adm/manutencoes/${id}` : '/adm/manutencoes'
  if (!idValido(id)) redirect(`${caminho}?erro=${encodeURIComponent('Visita não encontrada.')}`)
  if (texto(formData, 'confirmar') !== 'sim') {
    redirect(`${caminho}?erro=${encodeURIComponent('Confirme a exclusão desta manutenção avulsa.')}`)
  }

  const supabase = await clienteAdm()
  const { error } = await supabase.rpc('excluir_manutencao_avulsa', { p_id: id })
  if (error) redirect(`${caminho}?erro=${encodeURIComponent(mensagemManutencao(error.message))}`)
  atualizar(id)
  redirect('/adm/manutencoes?salvo=excluida')
}
