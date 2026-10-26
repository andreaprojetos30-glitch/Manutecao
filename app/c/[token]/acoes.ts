'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { tokenConfirmacaoValido } from '@/lib/confirmacao-sindico'
import { confirmarPeloToken, gravarConcessao } from '@/lib/confirmacao-sindico-dados'

export async function confirmarRealizacao(formData: FormData) {
  const token = String(formData.get('token') ?? '')
  if (!tokenConfirmacaoValido(token)) redirect('/c')
  const resultado = await confirmarPeloToken(token)
  if (resultado.estado === 'sem_sindico') redirect(`/c/${token}?aviso=sindico`)
  if (resultado.estado === 'confirmada') {
    const cabecalho = await headers()
    const seguro = cabecalho.get('x-forwarded-proto')?.split(',')[0]?.trim() === 'https'
    const gravou = await gravarConcessao(token, resultado.manutencaoId, seguro)
    if (gravou) redirect(`/c/${token}/pronto`)
    redirect(`/c/${token}`)
  }
  if (resultado.estado === 'encerrada') redirect(`/c/${token}`)
  redirect('/c')
}
