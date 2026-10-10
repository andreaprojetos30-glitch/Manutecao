'use server'

import { redirect } from 'next/navigation'
import {
  avaliarPin,
  conferirSegredo,
  contaTentativas,
  hashPin,
  novoSelo,
  pinAceito,
} from '@/lib/desbloqueio'
import {
  bloquearAcessoPorTentativas,
  gravarDesbloqueio,
  gravarTentativas,
  lerAcessoOperacional,
  limparDesbloqueio,
  salvarPinInicial,
} from '@/lib/prestador-login'
import { createClient } from '@/lib/supabase/server'

async function usuarioPrestador() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('usuarios').select('perfil, ativo').eq('id', user.id).maybeSingle()
  if (data?.perfil !== 'prestador' || !data.ativo) return null
  return user
}

export async function definirPin(formData: FormData) {
  const user = await usuarioPrestador()
  if (!user) redirect('/login')
  const acesso = await lerAcessoOperacional(user.id)
  if (!acesso) redirect('/prestador/pin?erro=config')
  if (acesso.pinHash) redirect('/prestador/desbloquear')

  const pin = String(formData.get('pin') ?? '')
  const repetir = String(formData.get('repetir') ?? '')
  if (!pinAceito(pin) || pin !== repetir) redirect('/prestador/pin?erro=pin')
  const pinHash = await hashPin(pin)
  const selo = novoSelo()
  if (!pinHash) redirect('/prestador/pin?erro=pin')
  const gravou = await salvarPinInicial(acesso.prestadorId, pinHash, selo)
  if (!gravou) redirect('/prestador/pin?erro=pin')
  const liberou = await gravarDesbloqueio(user.id, selo)
  if (!liberou) redirect('/prestador/desbloquear')
  redirect('/prestador')
}

export async function desbloquearComPin(formData: FormData) {
  const user = await usuarioPrestador()
  if (!user) redirect('/login')
  const acesso = await lerAcessoOperacional(user.id)
  if (!acesso?.pinHash || !acesso.selo) redirect('/prestador/pin')

  const agora = Date.now()
  const conta = contaTentativas({
    tentativas: acesso.tentativas,
    bloqueios: acesso.bloqueios,
    bloqueado_ate: acesso.bloqueadoAte,
  })
  if (conta.bloqueadoAte !== null && conta.bloqueadoAte > agora) {
    redirect('/prestador/desbloquear?erro=pausa')
  }

  const pin = String(formData.get('pin') ?? '')
  const correto = await conferirSegredo(pin, acesso.pinHash)
  const resultado = avaliarPin(conta, agora, correto)
  if (resultado.tipo === 'aguardar') redirect('/prestador/desbloquear?erro=pausa')
  if (resultado.tipo === 'revogar') {
    await bloquearAcessoPorTentativas(acesso.prestadorId, user.id)
    const supabase = await createClient()
    await supabase.auth.signOut({ scope: 'global' })
    await limparDesbloqueio()
    redirect('/login?erro=pin')
  }

  const gravou = await gravarTentativas(acesso.prestadorId, conta, resultado.conta)
  if (!gravou || resultado.tipo !== 'liberado') redirect('/prestador/desbloquear?erro=incorreto')
  const liberou = await gravarDesbloqueio(user.id, acesso.selo)
  if (!liberou) redirect('/prestador/desbloquear?erro=config')
  redirect('/prestador')
}

export async function bloquearCelular() {
  const user = await usuarioPrestador()
  if (!user) redirect('/login')
  await limparDesbloqueio()
  redirect('/prestador/desbloquear')
}

export async function encerrarCelular(formData: FormData) {
  if (String(formData.get('confirmar') ?? '') !== 'sim') {
    redirect(`/prestador?erro=${encodeURIComponent('Confirme que deseja encerrar o acesso neste celular.')}`)
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  await limparDesbloqueio()
  await supabase.auth.signOut({ scope: 'global' })
  redirect('/login?erro=encerrado')
}
