'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { idValido } from '@/lib/cadastros'
import { bucketServicoComprovante, integrarComprovante, type LeitorComprovante } from '@/lib/comprovante-liberacao'
import { clientePrestador } from '@/lib/consultas-execucao'
import { mensagemExecucao, textoFaltam, validarFoto, validarOcorrencia } from '@/lib/execucao'
import {
  avaliarInfoFoto,
  BUCKET_FOTOS,
  caminhoFotoPermitido,
  ERRO_FOTO_NAO_ENVIADA,
  infoFotoDe,
  montarCaminhoFoto,
} from '@/lib/fotos'

export type EstadoOcorrencia = { erro: string }

export type EnvioFotoAutorizado = { caminho: string; token: string }

export type RespostaEnvioFoto = { erro: string; envio: EnvioFotoAutorizado | null }

function texto(formData: FormData, campo: string) {
  return String(formData.get(campo) ?? '')
}

function textoEntrada(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : ''
}

async function fotoConfirmada(supabase: Awaited<ReturnType<typeof clientePrestador>>, caminho: string) {
  try {
    const { data, error } = await supabase.storage.from(BUCKET_FOTOS).info(caminho)
    if (error || !data) return { ok: false as const, erro: ERRO_FOTO_NAO_ENVIADA, apagar: false }
    return avaliarInfoFoto(infoFotoDe(data))
  } catch {
    return { ok: false as const, erro: ERRO_FOTO_NAO_ENVIADA, apagar: false }
  }
}

function caminhoVisita(id: string) {
  return `/prestador/manutencoes/${id}`
}

function atualizar(id: string) {
  revalidatePath('/prestador')
  revalidatePath(caminhoVisita(id))
}

async function itemDaVisita(manutencaoId: string, itemId: string) {
  const supabase = await clientePrestador()
  const { data } = await supabase
    .from('itens_manutencao')
    .select('id, manutencao_id')
    .eq('id', itemId)
    .maybeSingle()
  if (!data || data.manutencao_id !== manutencaoId) return null
  return { supabase }
}

export async function registrarOk(formData: FormData) {
  const manutencaoId = texto(formData, 'manutencao_id').trim()
  const itemId = texto(formData, 'item_id').trim()
  const caminho = idValido(manutencaoId) ? caminhoVisita(manutencaoId) : '/prestador'
  if (!idValido(manutencaoId) || !idValido(itemId)) {
    redirect(`${caminho}?erro=${encodeURIComponent('Equipamento não encontrado.')}`)
  }

  const acesso = await itemDaVisita(manutencaoId, itemId)
  if (!acesso) redirect(`${caminho}?erro=${encodeURIComponent('Equipamento não encontrado.')}`)

  const { error } = await acesso.supabase.rpc('registrar_ok', { p_item: itemId })
  if (error) redirect(`${caminho}?erro=${encodeURIComponent(mensagemExecucao(error.message))}`)
  atualizar(manutencaoId)
  redirect(`${caminho}?salvo=equipamento-ok`)
}

export async function autorizarEnvioFoto(entrada: {
  manutencaoId: string
  itemId: string
  nome: string
  tipo: string
  tamanho: number
}): Promise<RespostaEnvioFoto> {
  const manutencaoId = textoEntrada(entrada.manutencaoId).toLowerCase()
  const itemId = textoEntrada(entrada.itemId).toLowerCase()
  const nome = textoEntrada(entrada.nome).slice(0, 300)
  const tipo = textoEntrada(entrada.tipo).slice(0, 120)
  const tamanho = typeof entrada.tamanho === 'number' && Number.isFinite(entrada.tamanho) ? entrada.tamanho : 0
  if (!idValido(manutencaoId) || !idValido(itemId)) return { erro: 'Equipamento não encontrado.', envio: null }

  const erroFoto = validarFoto({ size: tamanho, type: tipo, name: nome }, false)
  if (erroFoto) return { erro: erroFoto, envio: null }

  const acesso = await itemDaVisita(manutencaoId, itemId)
  if (!acesso) return { erro: 'Equipamento não encontrado.', envio: null }

  const caminho = montarCaminhoFoto(manutencaoId, itemId, nome, Date.now())
  if (!caminho || !caminhoFotoPermitido(manutencaoId, itemId, caminho)) {
    return { erro: ERRO_FOTO_NAO_ENVIADA, envio: null }
  }

  const { data, error } = await acesso.supabase.storage.from(BUCKET_FOTOS).createSignedUploadUrl(caminho, { upsert: false })
  const caminhoAssinado = (data?.path ?? '').replace(/^\/+/, '')
  if (error || !data?.token || caminhoAssinado !== caminho) return { erro: ERRO_FOTO_NAO_ENVIADA, envio: null }
  return { erro: '', envio: { caminho, token: data.token } }
}

export async function registrarOcorrencia(_estado: EstadoOcorrencia, formData: FormData): Promise<EstadoOcorrencia> {
  const manutencaoId = texto(formData, 'manutencao_id').trim().toLowerCase()
  const itemId = texto(formData, 'item_id').trim().toLowerCase()
  const fotoInformada = texto(formData, 'foto_atual').trim()
  const fotoAtual = fotoInformada.startsWith(`${manutencaoId}/`) && !fotoInformada.includes('..') ? fotoInformada : ''
  const fotoNova = texto(formData, 'foto_enviada').trim()
  const validado = validarOcorrencia(texto(formData, 'descricao'), texto(formData, 'resolvida'))
  if (!idValido(manutencaoId) || !idValido(itemId)) return { erro: 'Equipamento não encontrado.' }
  if (validado.erro || validado.resolvida === null) return { erro: validado.erro ?? 'Não foi possível salvar.' }
  if (!fotoNova && !fotoAtual) return { erro: 'Selecione uma foto.' }
  if (fotoNova && !caminhoFotoPermitido(manutencaoId, itemId, fotoNova)) return { erro: ERRO_FOTO_NAO_ENVIADA }

  const acesso = await itemDaVisita(manutencaoId, itemId)
  if (!acesso) return { erro: 'Equipamento não encontrado.' }

  let foto = fotoAtual
  let enviadaAgora = ''
  if (fotoNova) {
    const confirmada = await fotoConfirmada(acesso.supabase, fotoNova)
    if (!confirmada.ok) {
      if (confirmada.apagar) await acesso.supabase.storage.from(BUCKET_FOTOS).remove([fotoNova])
      return { erro: confirmada.erro }
    }
    foto = fotoNova
    enviadaAgora = fotoNova
  }

  const { error } = await acesso.supabase.rpc('registrar_ocorrencia', {
    p_item: itemId,
    p_resolvida: validado.resolvida,
    p_descricao: validado.descricao,
    p_foto: foto,
  })
  if (error) {
    if (enviadaAgora) await acesso.supabase.storage.from(BUCKET_FOTOS).remove([enviadaAgora])
    return { erro: mensagemExecucao(error.message) }
  }

  if (enviadaAgora && fotoAtual && fotoAtual !== enviadaAgora && fotoAtual.startsWith(`${manutencaoId}/`) && !fotoAtual.includes('..')) {
    await acesso.supabase.storage.from(BUCKET_FOTOS).remove([fotoAtual])
  }

  atualizar(manutencaoId)
  redirect(`${caminhoVisita(manutencaoId)}?salvo=ocorrencia`)
}

export async function finalizarManutencao(formData: FormData) {
  const id = texto(formData, 'id').trim()
  const caminho = idValido(id) ? caminhoVisita(id) : '/prestador'
  if (!idValido(id)) redirect(`${caminho}?erro=${encodeURIComponent('Visita não encontrada.')}`)
  if (texto(formData, 'confirmar') !== 'sim') {
    redirect(`${caminho}?erro=${encodeURIComponent('Confirme a finalização desta manutenção.')}`)
  }

  const supabase = await clientePrestador()
  const { count, error: erroContagem } = await supabase
    .from('itens_manutencao')
    .select('id', { count: 'exact', head: true })
    .eq('manutencao_id', id)
    .eq('resultado', 'pendente')
  if (erroContagem) redirect(`${caminho}?erro=${encodeURIComponent('Não foi possível salvar. Verifique a conexão e tente de novo.')}`)
  const faltam = textoFaltam(count ?? 0)
  if (faltam) redirect(`${caminho}?erro=${encodeURIComponent(faltam)}`)

  const { data, error } = await supabase.rpc('finalizar_manutencao', { p_id: id })
  if (error) redirect(`${caminho}?erro=${encodeURIComponent(mensagemExecucao(error.message))}`)
  if (data === 'realizada' || data === 'aguardando_administracao') {
    const liberacao = await integrarComprovante(
      supabase as unknown as LeitorComprovante,
      bucketServicoComprovante(),
      id,
      false,
    )
    if (liberacao.erro) {
      atualizar(id)
      const falha = liberacao.erro === 'O comprovante não foi armazenado.' || liberacao.erro === 'O comprovante não pôde ser gerado.'
        ? 'A manutenção foi finalizada, mas o comprovante não foi armazenado.'
        : mensagemExecucao(liberacao.erro)
      redirect(`${caminho}?erro=${encodeURIComponent(falha)}`)
    }
  }
  atualizar(id)
  redirect(`${caminho}?salvo=finalizada`)
}
