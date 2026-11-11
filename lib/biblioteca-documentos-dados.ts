import { createClient } from '@supabase/supabase-js'
import { clienteAdm } from '@/lib/adm'
import { bibliotecaCondominio } from '@/lib/biblioteca-documentos'
import { idValido } from '@/lib/cadastros'

function clienteServico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return null
  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function administrador() {
  const supabase = await clienteAdm()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id && idValido(user.id) ? user.id : null
}

export async function lerBibliotecaCondominio(condominioId: string) {
  if (!idValido(condominioId)) return { estado: 'indisponivel' as const }
  const adminId = await administrador()
  const servico = clienteServico()
  if (!adminId || !servico) return { estado: 'indisponivel' as const }
  const { data, error } = await servico.rpc('biblioteca_documentos_condominio', {
    p_admin: adminId,
    p_condominio_id: condominioId,
  })
  if (error) return { estado: 'indisponivel' as const }
  const biblioteca = bibliotecaCondominio(data)
  if (!biblioteca) return { estado: 'indisponivel' as const }
  return { estado: 'ok' as const, biblioteca }
}
