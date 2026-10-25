'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { idValido } from '@/lib/cadastros'
import { bucketServicoComprovante, integrarComprovante, type LeitorComprovante } from '@/lib/comprovante-liberacao'
import { clientePrestador } from '@/lib/consultas-execucao'
import { extensaoFoto, mensagemExecucao, textoFaltam, validarFoto, validarOcorrencia } from '@/lib/execucao'

export type EstadoOcorrencia = { erro: string }

function texto(formData: FormData, campo: string) {
  return String(formData.get(campo) ?? '')
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

export async function registrarOcorrencia(_estado: EstadoOcorrencia, formData: FormData): Promise<EstadoOcorrencia> {
  const manutencaoId = texto(formData, 'manutencao_id').trim()
  const itemId = texto(formData, 'item_id').trim()
  const fotoInformada = texto(formData, 'foto_atual').trim()
  const fotoAtual = fotoInformada.startsWith(`${manutencaoId}/`) && !fotoInformada.includes('..') ? fotoInformada : ''
  const validado = validarOcorrencia(texto(formData, 'descricao'), texto(formData, 'resolvida'))
  if (!idValido(manutencaoId) || !idValido(itemId)) return { erro: 'Equipamento não encontrado.' }
  if (validado.erro || validado.resolvida === null) return { erro: validado.erro ?? 'Não foi possível salvar.' }

  const arquivo = formData.get('foto')
  const enviado = arquivo instanceof File && arquivo.size > 0 ? arquivo : null
  const erroFoto = validarFoto(enviado, Boolean(fotoAtual))
  if (erroFoto) return { erro: erroFoto }

  const acesso = await itemDaVisita(manutencaoId, itemId)
  if (!acesso) return { erro: 'Equipamento não encontrado.' }

  let foto = fotoAtual
  let enviadaAgora = ''
  if (enviado) {
    const caminhoFoto = `${manutencaoId}/${itemId}-${Date.now()}.${extensaoFoto(enviado.name)}`
    const bytes = Buffer.from(await enviado.arrayBuffer())
    const { error } = await acesso.supabase.storage.from('fotos').upload(caminhoFoto, bytes, {
      contentType: enviado.type || 'image/jpeg',
      upsert: false,
    })
    if (error) return { erro: 'A foto não foi enviada. Verifique a conexão e tente de novo.' }
    foto = caminhoFoto
    enviadaAgora = caminhoFoto
  }

  const { error } = await acesso.supabase.rpc('registrar_ocorrencia', {
    p_item: itemId,
    p_resolvida: validado.resolvida,
    p_descricao: validado.descricao,
    p_foto: foto,
  })
  if (error) {
    if (enviadaAgora) await acesso.supabase.storage.from('fotos').remove([enviadaAgora])
    return { erro: mensagemExecucao(error.message) }
  }

  if (enviadaAgora && fotoAtual && fotoAtual !== enviadaAgora && fotoAtual.startsWith(`${manutencaoId}/`)) {
    await acesso.supabase.storage.from('fotos').remove([fotoAtual])
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
