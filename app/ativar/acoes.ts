'use server'

import { redirect } from 'next/navigation'
import { buscarAtivacao, consumirAtivacao, prepararEntrada, suspenderLogin } from '@/lib/prestador-login'
import { tokenAtivacaoValido } from '@/lib/desbloqueio'
import { supabaseConfigurado } from '@/lib/supabase/ambiente'
import { createClient } from '@/lib/supabase/server'

export async function ativarComLink(formData: FormData) {
  if (!supabaseConfigurado()) redirect('/ativar?erro=config')
  const token = String(formData.get('token') ?? '')
  const destino = tokenAtivacaoValido(token) ? `/ativar/${token}` : '/ativar'
  if (!tokenAtivacaoValido(token)) redirect(`${destino}?erro=ativacao`)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const { data: perfil } = await supabase.from('usuarios').select('perfil').eq('id', user.id).maybeSingle()
    if (perfil?.perfil === 'admin') redirect(`${destino}?erro=celular`)
  }

  const achado = await buscarAtivacao(token)
  if (!achado) redirect(`${destino}?erro=ativacao`)

  const consumido = await consumirAtivacao(achado.prestadorId, achado.hash)
  if (!consumido) redirect(`${destino}?erro=ativacao`)

  const entrada = await prepararEntrada(achado.usuarioId)
  if ('erro' in entrada) {
    await suspenderLogin(achado.usuarioId)
    redirect(`${destino}?erro=ativacao`)
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: entrada.email,
    password: entrada.senha,
  })
  if (error) {
    await suspenderLogin(achado.usuarioId)
    redirect(`${destino}?erro=ativacao`)
  }

  redirect('/prestador/pin')
}
