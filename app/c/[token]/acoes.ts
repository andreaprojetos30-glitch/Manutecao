'use server'

import { redirect } from 'next/navigation'
import { tokenConfirmacaoValido } from '@/lib/confirmacao-sindico'
import { confirmarPeloToken } from '@/lib/confirmacao-sindico-dados'

export async function confirmarRealizacao(formData: FormData) {
  const token = String(formData.get('token') ?? '')
  if (!tokenConfirmacaoValido(token)) redirect('/c')
  const resultado = await confirmarPeloToken(token)
  if (resultado.estado === 'sem_sindico') redirect(`/c/${token}?aviso=sindico`)
  if (resultado.estado === 'indisponivel') redirect('/c')
  redirect(`/c/${token}`)
}
