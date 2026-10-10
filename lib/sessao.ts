import { redirect } from 'next/navigation'
import { destinoOperacional, type Destino } from '@/lib/acesso'
import { passoPrestador } from '@/lib/desbloqueio'
import { celularDesbloqueado, lerEstadoPin } from '@/lib/prestador-login'
import { supabaseConfigurado } from '@/lib/supabase/ambiente'
import { createClient } from '@/lib/supabase/server'

export async function lerSessao(): Promise<{ nome: string; destino: Destino } | null> {
  if (!supabaseConfigurado()) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase
    .from('usuarios')
    .select('nome, perfil, ativo')
    .eq('id', user.id)
    .maybeSingle()

  const nome = data?.nome?.trim() || 'Usuário'

  return {
    nome,
    destino: destinoOperacional(data?.perfil, data?.ativo ?? false),
  }
}

export async function exigirDestino(esperado: Destino) {
  const sessao = await lerSessao()
  if (!sessao) redirect('/login')
  if (sessao.destino !== esperado) redirect(sessao.destino)
  return sessao
}

export async function exigirPrestadorOperando() {
  const sessao = await exigirDestino('/prestador')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const estado = await lerEstadoPin(user.id)
  const pinDefinido = Boolean(estado?.pinDefinido)
  const desbloqueado = pinDefinido && (await celularDesbloqueado(user.id))
  const passo = passoPrestador({ pinDefinido, desbloqueado })
  if (passo === 'definir-pin') redirect('/prestador/pin')
  if (passo === 'desbloquear') redirect('/prestador/desbloquear')
  return sessao
}
