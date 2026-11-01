'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { idValido } from '@/lib/cadastros'
import { ativarAcompanhamentoDoAdm, incluirComprovanteDoAdm } from '@/lib/acompanhamento-comprovante-dados'
import { mensagemManutencao } from '@/lib/manutencoes'
import { createClient } from '@/lib/supabase/server'

async function administrador() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id && idValido(user.id) ? user.id : null
}

export async function ativarAcompanhamento(formData: FormData) {
  const userId = await administrador()
  if (!userId) redirect('/adm/manutencoes?erro=Sem%20permiss%C3%A3o%20para%20esta%20altera%C3%A7%C3%A3o.')
  const resultado = await ativarAcompanhamentoDoAdm(userId, String(formData.get('confirmacao') ?? ''))
  if ('erro' in resultado) {
    redirect(`/adm/manutencoes?erro=${encodeURIComponent(mensagemManutencao(resultado.erro ?? ''))}`)
  }
  revalidatePath('/adm/manutencoes')
  redirect('/adm/manutencoes?salvo=acompanhamento')
}

export async function incluirComprovanteAcompanhamento(formData: FormData) {
  const visitaId = String(formData.get('visita_id') ?? '')
  const caminho = idValido(visitaId) ? `/adm/manutencoes/${visitaId}` : '/adm/manutencoes'
  const userId = await administrador()
  if (!userId) redirect(`${caminho}?erro=${encodeURIComponent('Sem permissão para esta alteração.')}`)
  const resultado = await incluirComprovanteDoAdm(userId, visitaId, String(formData.get('confirmacao') ?? ''))
  if ('erro' in resultado) {
    redirect(`${caminho}?erro=${encodeURIComponent(mensagemManutencao(resultado.erro ?? ''))}`)
  }
  revalidatePath('/adm/manutencoes')
  revalidatePath(caminho)
  redirect(`${caminho}?salvo=acompanhamento-incluido`)
}
