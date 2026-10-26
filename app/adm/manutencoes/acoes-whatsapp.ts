'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { idValido } from '@/lib/cadastros'
import { origemDaRequisicao } from '@/lib/confirmacao-sindico-dados'
import { mensagemManutencao } from '@/lib/manutencoes'
import { prepararEnvioDoAdm, registrarEnvioDoAdm } from '@/lib/whatsapp-comprovante-dados'
import { createClient } from '@/lib/supabase/server'

async function administrador(visitaId: string) {
  const caminho = idValido(visitaId) ? `/adm/manutencoes/${visitaId}` : '/adm/manutencoes'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { caminho, userId: null }
  return { caminho, userId: user.id }
}

export async function prepararEnvioWhatsapp(visitaId: string) {
  const { userId } = await administrador(visitaId)
  if (!userId) return { erro: 'Sem permissão para esta alteração.' }
  const origem = await origemDaRequisicao()
  const resultado = await prepararEnvioDoAdm({
    manutencaoId: visitaId,
    adminId: userId,
    hostPedido: origem.host,
  })
  if ('erro' in resultado) return { erro: mensagemManutencao(resultado.erro) }
  return resultado
}

export async function confirmarEnvioWhatsapp(formData: FormData) {
  const visitaId = String(formData.get('visita_id') ?? '')
  const { caminho, userId } = await administrador(visitaId)
  if (!userId) redirect(`${caminho}?erro=${encodeURIComponent('Sem permissão para esta alteração.')}`)
  const resultado = await registrarEnvioDoAdm({
    manutencaoId: visitaId,
    adminId: userId,
    acao: 'confirmar',
  })
  if ('erro' in resultado) redirect(`${caminho}?erro=${encodeURIComponent(mensagemManutencao(resultado.erro))}`)
  revalidatePath(caminho)
  redirect(`${caminho}?salvo=whatsapp-${resultado.classe}`)
}

export async function corrigirEnvioWhatsapp(formData: FormData) {
  const visitaId = String(formData.get('visita_id') ?? '')
  const referenciaId = String(formData.get('referencia_id') ?? '')
  const { caminho, userId } = await administrador(visitaId)
  if (!userId) redirect(`${caminho}?erro=${encodeURIComponent('Sem permissão para esta alteração.')}`)
  const resultado = await registrarEnvioDoAdm({
    manutencaoId: visitaId,
    adminId: userId,
    acao: 'correcao',
    referenciaId,
  })
  if ('erro' in resultado) redirect(`${caminho}?erro=${encodeURIComponent(mensagemManutencao(resultado.erro))}`)
  revalidatePath(caminho)
  redirect(`${caminho}?salvo=whatsapp-correcao`)
}
