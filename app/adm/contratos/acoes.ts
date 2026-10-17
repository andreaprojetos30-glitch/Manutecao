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

function pedidoAnteriores(formData: FormData, total: number, maximo: number) {
  const anterioresTexto = texto(formData, 'anteriores')
  const anteriores = Number(anterioresTexto.trim() || '0')
  const datas = Number.isInteger(anteriores) && anteriores > 0
    ? Array.from({ length: anteriores }, (_, indice) => texto(formData, `data_${indice + 1}`).slice(0, 10))
    : []
  return validarVisitasAnteriores(total, maximo, anterioresTexto, datas, texto(formData, 'confirmar') === 'sim')
}

export async function gerarProgramacao(formData: FormData) {
  const contratoId = texto(formData, 'contrato_id').trim()
  const caminho = idValido(contratoId) ? `/adm/contratos/${contratoId}/conferir` : '/adm/contratos'
  if (!idValido(contratoId)) voltar('/adm/contratos', 'Contrato não encontrado.')
  const total = Number(texto(formData, 'total_visitas'))
  const pedido = pedidoAnteriores(formData, Number.isInteger(total) ? total : 0, Number.isInteger(total) ? total : 0)
  if (pedido.erro) voltar(caminho, pedido.erro)

  const supabase = await clienteAdm()
  const { error } = await supabase.rpc('gerar_programacao_contrato', {
    p_contrato_id: contratoId,
    p_anteriores: pedido.anteriores,
    p_datas: pedido.datas,
    p_confirmar: pedido.anteriores > 0,
  })
  if (error) voltar(caminho, mensagemContrato(error.message))
  atualizarTelas(contratoId)
  redirect(`${caminho}?salvo=${pedido.anteriores > 0 ? 'anteriores' : 'programacao'}`)
}

export async function registrarVisitasAnteriores(formData: FormData) {
  const contratoId = texto(formData, 'contrato_id').trim()
  const caminho = idValido(contratoId) ? `/adm/contratos/${contratoId}/conferir` : '/adm/contratos'
  if (!idValido(contratoId)) voltar('/adm/contratos', 'Contrato não encontrado.')
  const total = Number(texto(formData, 'total_visitas'))
  const maximo = Number(texto(formData, 'maximo_anteriores'))
  const pedido = pedidoAnteriores(formData, Number.isInteger(total) ? total : 0, Number.isInteger(maximo) ? maximo : 0)
  if (pedido.erro) voltar(caminho, pedido.erro)
  if (pedido.anteriores < 1) voltar(caminho, 'Informe a quantidade de visitas anteriores.')

  const supabase = await clienteAdm()
  const { error } = await supabase.rpc('registrar_visitas_anteriores', {
    p_contrato_id: contratoId,
    p_anteriores: pedido.anteriores,
    p_datas: pedido.datas,
    p_confirmar: true,
  })
  if (error) voltar(caminho, mensagemContrato(error.message))
  atualizarTelas(contratoId)
  redirect(`${caminho}?salvo=anteriores`)
}
