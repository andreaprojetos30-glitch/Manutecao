import { createClient } from '@supabase/supabase-js'
import { idValido } from '@/lib/cadastros'
import { clienteAdm } from '@/lib/adm'
import { fatosAcompanhamento, fichaAcompanhamento } from '@/lib/acompanhamento-comprovante'

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

export async function lerFatosAcompanhamento() {
  const adminId = await administrador()
  const servico = clienteServico()
  if (!adminId || !servico) return { estado: 'indisponivel' as const }
  const { data, error } = await servico.rpc('fatos_acompanhamento_comprovantes', { p_admin: adminId })
  if (error) {
    console.error('Não foi possível ler o acompanhamento.')
    return { estado: 'indisponivel' as const }
  }
  const fatos = fatosAcompanhamento(data)
  if (!fatos) return { estado: 'indisponivel' as const }
  return { estado: 'ok' as const, fatos }
}

export async function lerFichaAcompanhamento(manutencaoId: string) {
  if (!idValido(manutencaoId)) return { estado: 'indisponivel' as const }
  const adminId = await administrador()
  const servico = clienteServico()
  if (!adminId || !servico) return { estado: 'indisponivel' as const }
  const { data, error } = await servico.rpc('ficha_acompanhamento_comprovante', {
    p_admin: adminId,
    p_manutencao_id: manutencaoId,
  })
  if (error) {
    console.error('Não foi possível ler o acompanhamento.')
    return { estado: 'indisponivel' as const }
  }
  const ficha = fichaAcompanhamento(data)
  if (!ficha) return { estado: 'indisponivel' as const }
  return { estado: 'ok' as const, ficha }
}

export async function ativarAcompanhamentoDoAdm(adminId: string, confirmacao: string) {
  const servico = clienteServico()
  if (!servico || !idValido(adminId)) return { erro: 'Sem permissão para esta alteração.' }
  const { error } = await servico.rpc('ativar_acompanhamento_comprovantes', {
    p_admin: adminId,
    p_confirmacao: confirmacao,
  })
  if (error) return { erro: error.message }
  return { ok: true as const }
}

export async function incluirComprovanteDoAdm(adminId: string, manutencaoId: string, confirmacao: string) {
  const servico = clienteServico()
  if (!servico || !idValido(adminId) || !idValido(manutencaoId)) return { erro: 'Sem permissão para esta alteração.' }
  const { error } = await servico.rpc('incluir_comprovante_no_acompanhamento', {
    p_admin: adminId,
    p_manutencao_id: manutencaoId,
    p_confirmacao: confirmacao,
  })
  if (error) return { erro: error.message }
  return { ok: true as const }
}
