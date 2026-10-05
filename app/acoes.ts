'use server'

import { redirect } from 'next/navigation'
import { destinoOperacional } from '@/lib/acesso'
import { supabaseConfigurado } from '@/lib/supabase/ambiente'
import { createClient } from '@/lib/supabase/server'

export async function entrar(formData: FormData) {
  if (!supabaseConfigurado()) {
    redirect('/login?erro=config')
  }

  const email = String(formData.get('email') ?? '').trim()
  const senha = String(formData.get('senha') ?? '')
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  })

  if (error) {
    redirect('/login?erro=credenciais')
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?erro=credenciais')
  }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('perfil, ativo')
    .eq('id', user.id)
    .maybeSingle()

  redirect(destinoOperacional(usuario?.perfil, usuario?.ativo ?? false))
}

export async function sair() {
  if (supabaseConfigurado()) {
    const supabase = await createClient()
    await supabase.auth.signOut()
  }
  redirect('/login')
}
