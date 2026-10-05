'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { clienteAdm } from '@/lib/adm'
import { idValido } from '@/lib/cadastros'
import {
  mensagemContrato,
  validarContrato,
  validarEquipamentoContrato,
  type ContratoInput,
  type EquipamentoContratoInput,
} from '@/lib/contratos'

export type EstadoForm = { erro: string }

function texto(formData: FormData, campo: string) {
  return String(formData.get(campo) ?? '')
}

function voltar(caminho: string, erro: string): never {
  redirect(`${caminho}?erro=${encodeURIComponent(erro)}`)
}

function contratoInput(formData: FormData): ContratoInput {
  return {
    condominioId: texto(formData, 'condominio_id').trim(),
    dataInicioContrato: texto(formData, 'data_inicio_contrato'),
    dataInicioManutencao: texto(formData, 'data_inicio_manutencao'),
    quantidadeVisitas: texto(formData, 'quantidade_visitas'),
    prestadorId: texto(formData, 'prestador_id').trim(),
    status: texto(formData, 'status'),
  }
}

function equipamentoInput(formData: FormData): EquipamentoContratoInput {
  return {
    matrizId: texto(formData, 'equipamento_matriz_id').trim(),
    nome: texto(formData, 'nome_identificacao'),
    entrada: texto(formData, 'data_entrada'),
    saida: texto(formData, 'data_saida'),
  }
}

function atualizarTelas(id: string) {
  revalidatePath('/adm/contratos')
  revalidatePath(`/adm/contratos/${id}`)
  revalidatePath(`/adm/contratos/${id}/equipamentos`)
  revalidatePath(`/adm/contratos/${id}/conferir`)
  revalidatePath('/adm/condominios', 'layout')
}

export async function salvarContrato(_estado: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const id = texto(formData, 'id').trim()
  const validado = validarContrato(contratoInput(formData))
  if (validado.erro || !validado.dados) return { erro: validado.erro ?? 'Não foi possível salvar.' }
  if (id && !idValido(id)) return { erro: 'Contrato não encontrado.' }

  const supabase = await clienteAdm()
  const { data: condominio } = await supabase.from('condominios').select('id').eq('id', validado.dados.condominioId).maybeSingle()
  if (!condominio) return { erro: 'Selecione o condomínio.' }

  if (validado.dados.prestadorId) {
    const { data: prestador } = await supabase.from('prestadores').select('id, ativo').eq('id', validado.dados.prestadorId).maybeSingle()
    if (!prestador) return { erro: 'Selecione o prestador.' }
    if (!prestador.ativo) {
      const { data: atual } = id
        ? await supabase.from('contratos').select('prestador_padrao_id').eq('id', id).maybeSingle()
        : { data: null }
      if (atual?.prestador_padrao_id !== prestador.id) return { erro: 'Selecione o prestador.' }
    }
  }

  const payload = {
    condominio_id: validado.dados.condominioId,
    tipo: 'mensal' as const,
    data_inicio_contrato: validado.dados.dataInicioContrato,
    data_fim_contrato: validado.dados.dataFimContrato,
    data_inicio_manutencao: validado.dados.dataInicioManutencao,
    quantidade_visitas: validado.dados.quantidadeVisitas,
    prestador_padrao_id: validado.dados.prestadorId,
    status: validado.dados.status,
  }

  if (id) {
    const { count } = await supabase
      .from('manutencoes')
      .select('id', { count: 'exact', head: true })
      .eq('contrato_id', id)
      .eq('tipo', 'preventiva')
      .eq('origem', 'automatica')
    if ((count ?? 0) > 0) {
      const { data: atual } = await supabase
        .from('contratos')
        .select('condominio_id, data_inicio_manutencao, quantidade_visitas')
        .eq('id', id)
        .maybeSingle()
      if (
        atual &&
        (atual.condominio_id !== payload.condominio_id ||
          String(atual.data_inicio_manutencao).slice(0, 10) !== payload.data_inicio_manutencao ||
          atual.quantidade_visitas !== payload.quantidade_visitas)
      ) {
        return { erro: 'A programação já foi gerada. O condomínio, a data de início da manutenção e a quantidade de visitas permanecem.' }
      }
    }

    const { error } = await supabase.from('contratos').update(payload).eq('id', id).select('id').single()
    if (error) return { erro: mensagemContrato(error.message) }
    atualizarTelas(id)
    redirect(`/adm/contratos/${id}?salvo=contrato`)
  }

  const { data: numero, error: erroNumero } = await supabase.rpc('proximo_numero_contrato')
  if (erroNumero || typeof numero !== 'string' || !numero) return { erro: mensagemContrato(erroNumero?.message ?? '') }

  let gravado = await supabase.from('contratos').insert({ ...payload, numero_contrato: numero }).select('id').single()
  if (gravado.error?.code === '23505') {
    const seguinte = await supabase.rpc('proximo_numero_contrato')
    if (seguinte.error || typeof seguinte.data !== 'string') return { erro: mensagemContrato(seguinte.error?.message ?? '') }
    gravado = await supabase.from('contratos').insert({ ...payload, numero_contrato: seguinte.data }).select('id').single()
  }
  if (gravado.error || !gravado.data) return { erro: mensagemContrato(gravado.error?.message ?? '') }

  atualizarTelas(gravado.data.id)
  redirect(`/adm/contratos/${gravado.data.id}?salvo=contrato`)
}

export async function salvarEquipamentoContrato(_estado: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const contratoId = texto(formData, 'contrato_id').trim()
  const id = texto(formData, 'id').trim()
  if (!idValido(contratoId)) return { erro: 'Contrato não encontrado.' }
  if (id && !idValido(id)) return { erro: 'Equipamento não encontrado.' }
  const validado = validarEquipamentoContrato(equipamentoInput(formData))
  if (validado.erro || !validado.dados) return { erro: validado.erro ?? 'Não foi possível salvar.' }

  const supabase = await clienteAdm()
  const { error } = await supabase.rpc('salvar_equipamento_contrato', {
    p_id: id || null,
    p_contrato_id: contratoId,
    p_matriz_id: validado.dados.matrizId,
    p_nome: validado.dados.nome,
    p_entrada: validado.dados.entrada,
    p_saida: validado.dados.saida,
  })
  if (error) return { erro: mensagemContrato(error.message) }

  atualizarTelas(contratoId)
  redirect(`/adm/contratos/${contratoId}/equipamentos?salvo=equipamento`)
}

export async function removerEquipamentoContrato(formData: FormData) {
  const contratoId = texto(formData, 'contrato_id').trim()
  const id = texto(formData, 'id').trim()
  const caminho = idValido(contratoId) ? `/adm/contratos/${contratoId}/equipamentos` : '/adm/contratos'
  if (!idValido(contratoId) || !idValido(id)) voltar(caminho, 'Equipamento não encontrado.')

  const supabase = await clienteAdm()
  const { error } = await supabase.rpc('remover_equipamento_contrato', { p_id: id })
  if (error) voltar(caminho, mensagemContrato(error.message))
  atualizarTelas(contratoId)
  redirect(`${caminho}?salvo=removido`)
}

export async function gerarProgramacao(formData: FormData) {
  const contratoId = texto(formData, 'contrato_id').trim()
  const caminho = idValido(contratoId) ? `/adm/contratos/${contratoId}/conferir` : '/adm/contratos'
  if (!idValido(contratoId)) voltar('/adm/contratos', 'Contrato não encontrado.')

  const supabase = await clienteAdm()
  const { error } = await supabase.rpc('gerar_programacao_contrato', { p_contrato_id: contratoId })
  if (error) voltar(caminho, mensagemContrato(error.message))
  atualizarTelas(contratoId)
  redirect(`${caminho}?salvo=programacao`)
}
