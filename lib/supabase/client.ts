import { createBrowserClient } from '@supabase/ssr'
import { supabaseConfigurado } from '@/lib/supabase/ambiente'

export function createClient() {
  if (!supabaseConfigurado()) {
    throw new Error('Supabase não configurado')
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
