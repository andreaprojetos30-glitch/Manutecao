import type { SupabaseClient } from '@supabase/supabase-js'

export async function assinarFoto(supabase: SupabaseClient, caminho: string | null | undefined) {
  const foto = (caminho ?? '').trim()
  if (!foto || foto.includes('..') || foto.startsWith('/') || foto.startsWith('http')) return null
  const { data, error } = await supabase.storage.from('fotos').createSignedUrl(foto, 60 * 30)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
