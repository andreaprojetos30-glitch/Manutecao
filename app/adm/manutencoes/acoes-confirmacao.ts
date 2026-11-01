'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { idValido } from '@/lib/cadastros'
import { justificativaConfirmacao } from '@/lib/confirmacao-manual'
import { corrigirConfirmacaoManualDoAdm, registrarConfirmacaoManualDoAdm } from '@/lib/confirmacao-manual-dados'
import { mensagemManutencao } from '@/lib/manutencoes'
import { createClient } from '@/lib/supabase/server'

async function administrador() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id && idValido(user.id) ? user.id : null
}

function destino(visitaId: string) {
  return idValido(visitaId) ? `/adm/manutencoes/${visitaId}` : '/adm/manutencoes'
}

export async function registrarConfirmacaoManual(formData: FormData) {
  const visitaId = String(formData.get('visita_id') ?? '')
  const caminho = destino(visitaId)
  const userId = await administrador()
  if (!userId) redirect(`${caminho}?erro=${encodeURIComponent('Sem permissão para esta alteração.')}`)
  const justificativa = justificativaConfirmacao(String(formData.get('justificativa') ?? ''))
  if (justificativa.erro || !justificativa.texto) {
    redirect(`${caminho}?erro=${encodeURIComponent(justificativa.erro ?? 'Informe a justificativa da confirmação.')}`)
  }
  const resultado = await registrarConfirmacaoManualDoAdm(userId, visitaId, justificativa.texto)
  if ('erro' in resultado) {
    redirect(`${caminho}?erro=${encodeURIComponent(mensagemManutencao(resultado.erro ?? ''))}`)
  }
  revalidatePath('/adm/manutencoes')
  revalidatePath(caminho)
  redirect(`${caminho}?salvo=confirmacao-manual`)
}

export async function corrigirConfirmacaoManual(formData: FormData) {
  const visitaId = String(formData.get('visita_id') ?? '')
  const registroId = String(formData.get('registro_id') ?? '')
  const caminho = destino(visitaId)
  const userId = await administrador()
  if (!userId || !idValido(registroId)) redirect(`${caminho}?erro=${encodeURIComponent('Sem permissão para esta alteração.')}`)
  const justificativa = justificativaConfirmacao(String(formData.get('justificativa') ?? ''))
  if (justificativa.erro || !justificativa.texto) {
    redirect(`${caminho}?erro=${encodeURIComponent(justificativa.erro ?? 'Informe a justificativa da confirmação.')}`)
  }
  const resultado = await corrigirConfirmacaoManualDoAdm(userId, visitaId, registroId, justificativa.texto)
  if ('erro' in resultado) {
    redirect(`${caminho}?erro=${encodeURIComponent(mensagemManutencao(resultado.erro ?? ''))}`)
  }
  revalidatePath('/adm/manutencoes')
  revalidatePath(caminho)
  redirect(`${caminho}?salvo=confirmacao-correcao`)
}
