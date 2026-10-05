'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { clienteAdm } from '@/lib/adm'
import {
  hojeIso,
  idValido,
  mensagemBanco,
  validarCondominio,
  validarEquipamento,
  validarPrestador,
  validarSindicoCorrecao,
  validarSindicoNovo,
  type CondominioInput,
  type EquipamentoInput,
  type PrestadorInput,
  type SindicoInput,
} from '@/lib/cadastros'

export type EstadoForm = { erro: string }

function texto(formData: FormData, campo: string) {
  return String(formData.get(campo) ?? '')
}

function voltar(caminho: string, erro: string): never {
  redirect(`${caminho}?erro=${encodeURIComponent(erro)}`)
}

function condominioInput(formData: FormData): CondominioInput {
  return {
    nome: texto(formData, 'nome'),
    cep: texto(formData, 'cep'),
    endereco: texto(formData, 'endereco'),
    numero: texto(formData, 'numero'),
    complemento: texto(formData, 'complemento'),
    bairro: texto(formData, 'bairro'),
    cidade: texto(formData, 'cidade'),
    estado: texto(formData, 'estado'),
    quantidadeUnidades: texto(formData, 'quantidade_unidades'),
    observacoes: texto(formData, 'observacoes'),
  }
}

function sindicoInput(formData: FormData): SindicoInput {
  return {
    nome: texto(formData, 'nome'),
    whatsapp: texto(formData, 'whatsapp'),
    email: texto(formData, 'email'),
    dataInicio: texto(formData, 'data_inicio'),
    dataFim: texto(formData, 'data_fim'),
  }
}

function prestadorInput(formData: FormData): PrestadorInput {
  return {
    nome: texto(formData, 'nome'),
    whatsapp: texto(formData, 'whatsapp'),
    email: texto(formData, 'email'),
    usuarioId: texto(formData, 'usuario_id'),
    observacoes: texto(formData, 'observacoes'),
  }
}

function equipamentoInput(formData: FormData): EquipamentoInput {
  return {
    nome: texto(formData, 'nome'),
    categoria: texto(formData, 'categoria'),
    fabricante: texto(formData, 'fabricante'),
    modelo: texto(formData, 'modelo'),
    observacoes: texto(formData, 'observacoes'),
  }
}

export async function salvarCondominio(_estado: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const id = texto(formData, 'id').trim()
  const validado = validarCondominio(condominioInput(formData))
  if (validado.erro || !validado.dados) return { erro: validado.erro ?? 'Não foi possível salvar.' }
  if (id && !idValido(id)) return { erro: 'Condomínio não encontrado.' }

  const supabase = await clienteAdm()
  if (id) {
    const { error } = await supabase.from('condominios').update(validado.dados).eq('id', id).select('id').single()
    if (error) return { erro: mensagemBanco(error.message) }
    revalidatePath('/adm/condominios')
    revalidatePath(`/adm/condominios/${id}`)
    redirect(`/adm/condominios/${id}?salvo=salvo`)
  }

  const { data, error } = await supabase.from('condominios').insert(validado.dados).select('id').single()
  if (error || !data) return { erro: mensagemBanco(error?.message ?? '') }
  revalidatePath('/adm/condominios')
  redirect(`/adm/condominios/${data.id}?salvo=salvo`)
}

export async function alternarCondominio(formData: FormData) {
  const id = texto(formData, 'id').trim()
  const ativo = texto(formData, 'ativo') === 'true'
  if (!idValido(id)) voltar('/adm/condominios', 'Condomínio não encontrado.')

  const supabase = await clienteAdm()
  const { error } = await supabase.from('condominios').update({ ativo }).eq('id', id).select('id').single()
  if (error) voltar(`/adm/condominios/${id}`, mensagemBanco(error.message))
  revalidatePath('/adm/condominios')
  revalidatePath(`/adm/condominios/${id}`)
  redirect(`/adm/condominios/${id}?salvo=situacao`)
}

export async function registrarSindico(_estado: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const condominioId = texto(formData, 'condominio_id').trim()
  if (!idValido(condominioId)) return { erro: 'Condomínio não encontrado.' }
  const validado = validarSindicoNovo(sindicoInput(formData))
  if (validado.erro || !validado.dados) return { erro: validado.erro ?? 'Não foi possível salvar.' }

  const supabase = await clienteAdm()
  const { count } = await supabase
    .from('sindicos')
    .select('id', { count: 'exact', head: true })
    .eq('condominio_id', condominioId)
    .eq('ativo', true)

  const { error } = await supabase.rpc('registrar_sindico', {
    p_condominio_id: condominioId,
    p_nome: validado.dados.nome,
    p_whatsapp: validado.dados.whatsapp,
    p_email: validado.dados.email,
    p_data_inicio: validado.dados.data_inicio,
  })
  if (error) return { erro: mensagemBanco(error.message) }

  revalidatePath('/adm/sindicos')
  revalidatePath(`/adm/condominios/${condominioId}`)
  redirect(`/adm/condominios/${condominioId}?salvo=${count ? 'sindico' : 'salvo'}#sindicos`)
}

export async function corrigirSindico(_estado: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const id = texto(formData, 'id').trim()
  const condominioId = texto(formData, 'condominio_id').trim()
  if (!idValido(id) || !idValido(condominioId)) return { erro: 'Síndico não encontrado.' }

  const supabase = await clienteAdm()
  const { data: atual, error: leitura } = await supabase
    .from('sindicos')
    .select('ativo, condominio_id')
    .eq('id', id)
    .maybeSingle()
  if (leitura || !atual || atual.condominio_id !== condominioId) return { erro: 'Síndico não encontrado.' }

  const validado = validarSindicoCorrecao(sindicoInput(formData), atual.ativo)
  if (validado.erro || !validado.dados) return { erro: validado.erro ?? 'Não foi possível salvar.' }

  const { error } = await supabase.from('sindicos').update(validado.dados).eq('id', id).select('id').single()
  if (error) return { erro: mensagemBanco(error.message) }

  revalidatePath('/adm/sindicos')
  revalidatePath(`/adm/condominios/${condominioId}`)
  redirect(`/adm/condominios/${condominioId}/sindicos/${id}?salvo=salvo`)
}

export async function alternarSindico(formData: FormData) {
  const id = texto(formData, 'id').trim()
  const condominioId = texto(formData, 'condominio_id').trim()
  const destino = idValido(condominioId) ? `/adm/condominios/${condominioId}` : '/adm/sindicos'
  if (!idValido(id) || !idValido(condominioId)) voltar(destino, 'Síndico não encontrado.')

  const supabase = await clienteAdm()
  const { data: atual, error: leitura } = await supabase
    .from('sindicos')
    .select('ativo, data_fim, condominio_id')
    .eq('id', id)
    .maybeSingle()
  if (leitura || !atual || atual.condominio_id !== condominioId) voltar(destino, 'Síndico não encontrado.')

  if (!atual.ativo) {
    voltar(destino, 'Este período já está no histórico. Registre um novo síndico.')
  }

  const { error } = await supabase
    .from('sindicos')
    .update({ ativo: false, data_fim: atual.data_fim ?? hojeIso() })
    .eq('id', id)
    .select('id')
    .single()
  if (error) voltar(destino, mensagemBanco(error.message))

  revalidatePath('/adm/sindicos')
  revalidatePath(destino)
  redirect(`${destino}?salvo=situacao#sindicos`)
}

export async function salvarPrestador(_estado: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const id = texto(formData, 'id').trim()
  const validado = validarPrestador(prestadorInput(formData))
  if (validado.erro || !validado.dados) return { erro: validado.erro ?? 'Não foi possível salvar.' }
  if (id && !idValido(id)) return { erro: 'Prestador não encontrado.' }

  const supabase = await clienteAdm()
  if (id) {
    const { error } = await supabase.from('prestadores').update(validado.dados).eq('id', id).select('id').single()
    if (error) return { erro: mensagemBanco(error.message) }
    revalidatePath('/adm/prestadores')
    revalidatePath(`/adm/prestadores/${id}`)
    redirect(`/adm/prestadores/${id}?salvo=salvo`)
  }

  const { data, error } = await supabase.from('prestadores').insert(validado.dados).select('id').single()
  if (error || !data) return { erro: mensagemBanco(error?.message ?? '') }
  revalidatePath('/adm/prestadores')
  redirect(`/adm/prestadores/${data.id}?salvo=salvo`)
}

export async function alternarPrestador(formData: FormData) {
  const id = texto(formData, 'id').trim()
  const ativo = texto(formData, 'ativo') === 'true'
  if (!idValido(id)) voltar('/adm/prestadores', 'Prestador não encontrado.')

  const supabase = await clienteAdm()
  const { error } = await supabase.from('prestadores').update({ ativo }).eq('id', id).select('id').single()
  if (error) voltar(`/adm/prestadores/${id}`, mensagemBanco(error.message))
  revalidatePath('/adm/prestadores')
  revalidatePath(`/adm/prestadores/${id}`)
  redirect(`/adm/prestadores/${id}?salvo=situacao`)
}

export async function salvarEquipamento(_estado: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const id = texto(formData, 'id').trim()
  const validado = validarEquipamento(equipamentoInput(formData))
  if (validado.erro || !validado.dados) return { erro: validado.erro ?? 'Não foi possível salvar.' }
  if (id && !idValido(id)) return { erro: 'Equipamento não encontrado.' }

  const supabase = await clienteAdm()
  if (id) {
    const { error } = await supabase.from('equipamentos_matriz').update(validado.dados).eq('id', id).select('id').single()
    if (error) return { erro: mensagemBanco(error.message) }
    revalidatePath('/adm/equipamentos')
    revalidatePath(`/adm/equipamentos/${id}`)
    redirect(`/adm/equipamentos/${id}?salvo=salvo`)
  }

  const { data, error } = await supabase.from('equipamentos_matriz').insert(validado.dados).select('id').single()
  if (error || !data) return { erro: mensagemBanco(error?.message ?? '') }
  revalidatePath('/adm/equipamentos')
  redirect(`/adm/equipamentos/${data.id}?salvo=salvo`)
}

export async function alternarEquipamento(formData: FormData) {
  const id = texto(formData, 'id').trim()
  const ativo = texto(formData, 'ativo') === 'true'
  if (!idValido(id)) voltar('/adm/equipamentos', 'Equipamento não encontrado.')

  const supabase = await clienteAdm()
  const { error } = await supabase.from('equipamentos_matriz').update({ ativo }).eq('id', id).select('id').single()
  if (error) voltar(`/adm/equipamentos/${id}`, mensagemBanco(error.message))
  revalidatePath('/adm/equipamentos')
  revalidatePath(`/adm/equipamentos/${id}`)
  redirect(`/adm/equipamentos/${id}?salvo=situacao`)
}
