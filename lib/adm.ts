import { exigirDestino } from '@/lib/sessao'
import { createClient } from '@/lib/supabase/server'

export async function clienteAdm() {
  await exigirDestino('/adm')
  return createClient()
}
