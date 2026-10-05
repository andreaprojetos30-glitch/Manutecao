import { redirect } from 'next/navigation'
import { destinoOperacional, type Destino } from '@/lib/acesso'
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
