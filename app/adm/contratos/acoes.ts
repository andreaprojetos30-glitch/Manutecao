'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { clienteAdm } from '@/lib/adm'
import { idValido } from '@/lib/cadastros'
import {
  mensagemContrato,
  validarContrato,
  validarIdentificacao,
  validarSelecaoEquipamentos,
  validarVisitasAnteriores,
  type ContratoInput,
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
    visitasAnteriores: texto(formData, 'visitas_anteriores'),
    prestadorId: texto(formData, 'prestador_id').trim(),
    status: texto(formData, 'status'),
  }
}

function atualizarTelas(id: string) {
  revalidatePath('/adm/contratos')
  revalidatePath('/adm/manutencoes')
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
    visitas_anteriores: validado.dados.visitasAnteriores,
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
        .select('condominio_id, data_inicio_manutencao, quantidade_visitas, visitas_anteriores')
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
      if (atual && atual.visitas_anteriores !== payload.visitas_anteriores) {
        return { erro: 'A programação já foi gerada. As visitas anteriores permanecem.' }
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

export async function adicionarEquipamentosContrato(_estado: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const contratoId = texto(formData, 'contrato_id').trim()
  if (!idValido(contratoId)) return { erro: 'Contrato não encontrado.' }
  const ids = formData.getAll('matriz_id').map((valor) => String(valor).trim()).filter(Boolean)
  const validado = validarSelecaoEquipamentos(
    ids.map((matrizId) => ({ matrizId, quantidade: texto(formData, `quantidade_${matrizId}`) || '1' })),
  )
  if (validado.erro || !validado.dados) return { erro: validado.erro ?? 'Não foi possível salvar.' }

  const supabase = await clienteAdm()
  const { error } = await supabase.rpc('adicionar_equipamentos_contrato', {
    p_contrato_id: contratoId,
    p_selecao: validado.dados.map((item) => ({ matriz_id: item.matrizId, quantidade: item.quantidade })),
  })
  if (error) return { erro: mensagemContrato(error.message) }

  atualizarTelas(contratoId)
  redirect(`/adm/contratos/${contratoId}/equipamentos?salvo=equipamentos`)
}

export async function definirIdentificacao(_estado: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const contratoId = texto(formData, 'contrato_id').trim()
  const id = texto(formData, 'id').trim()
  if (!idValido(contratoId)) return { erro: 'Contrato não encontrado.' }
  if (!idValido(id)) return { erro: 'Equipamento não encontrado.' }
  const validado = validarIdentificacao(texto(formData, 'identificacao'))
  if (validado.erro) return { erro: validado.erro }

  const supabase = await clienteAdm()
  const { error } = await supabase.rpc('definir_identificacao_equipamento', {
    p_id: id,
    p_identificacao: validado.identificacao,
  })
  if (error) return { erro: mensagemContrato(error.message) }

  atualizarTelas(contratoId)
  redirect(`/adm/contratos/${contratoId}/equipamentos?salvo=identificacao`)
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
  const { data: atual, error: erroLeitura } = await supabase
    .from('contratos')
    .select('quantidade_visitas, visitas_anteriores')
    .eq('id', contratoId)
    .maybeSingle()
  if (erroLeitura || !atual) voltar(caminho, mensagemContrato(erroLeitura?.message ?? 'Contrato não encontrado'))
  const anteriores = Number(atual.visitas_anteriores)
  const total = Number(atual.quantidade_visitas)
  if (!Number.isInteger(anteriores) || !Number.isInteger(total)) voltar(caminho, 'Informe a quantidade de visitas anteriores.')
  const confirmar = anteriores > 0
  if (confirmar && texto(formData, 'confirmar') !== 'sim') voltar(caminho, 'Confirme as visitas anteriores.')
  const pedido = validarVisitasAnteriores(total, Math.max(total - 1, 0), String(anteriores), confirmar)
  if (pedido.erro) voltar(caminho, pedido.erro)

  const { error } = await supabase.rpc('gerar_programacao_contrato', {
    p_contrato_id: contratoId,
    p_anteriores: anteriores,
    p_datas: [],
    p_confirmar: confirmar,
  })
  if (error) voltar(caminho, mensagemContrato(error.message))
  atualizarTelas(contratoId)
  redirect(`${caminho}?salvo=${pedido.anteriores > 0 ? 'anteriores' : 'programacao'}`)
}

export async function registrarVisitasAnteriores(formData: FormData) {
  const contratoId = texto(formData, 'contrato_id').trim()
  const caminho = idValido(contratoId) ? `/adm/contratos/${contratoId}/conferir` : '/adm/contratos'
  if (!idValido(contratoId)) voltar('/adm/contratos', 'Contrato não encontrado.')

  const supabase = await clienteAdm()
  const { data: atual, error: erroLeitura } = await supabase
    .from('contratos')
    .select('quantidade_visitas, visitas_anteriores')
    .eq('id', contratoId)
    .maybeSingle()
  if (erroLeitura || !atual) voltar(caminho, mensagemContrato(erroLeitura?.message ?? 'Contrato não encontrado'))
  const total = Number(atual.quantidade_visitas)
  const jaContadas = Number(atual.visitas_anteriores)
  if (!Number.isInteger(total) || !Number.isInteger(jaContadas)) voltar(caminho, 'Informe a quantidade de visitas anteriores.')
  const maximo = Math.max(total - jaContadas - 1, 0)
  const pedido = validarVisitasAnteriores(total, maximo, texto(formData, 'anteriores'), texto(formData, 'confirmar') === 'sim', jaContadas)
  if (pedido.erro) voltar(caminho, pedido.erro)
  if (pedido.anteriores < 1) voltar(caminho, 'Informe a quantidade de visitas anteriores.')

  const { error } = await supabase.rpc('registrar_visitas_anteriores', {
    p_contrato_id: contratoId,
    p_anteriores: pedido.anteriores,
    p_datas: [],
    p_confirmar: true,
  })
  if (error) voltar(caminho, mensagemContrato(error.message))
  atualizarTelas(contratoId)
  redirect(`${caminho}?salvo=anteriores`)
}
