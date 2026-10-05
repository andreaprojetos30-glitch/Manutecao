import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { credenciaisPrestador, novaSenhaPrestador, type ContaEmail, type PerfilConta } from '@/lib/acesso-prestador'

const COOKIE = 'eleva_senha_prestador'

function clienteServico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return null
  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function perfilDe(valor: string | null): PerfilConta {
  if (valor === 'admin' || valor === 'prestador') return valor
  return null
}

function falhaAcesso(mensagem: string) {
  if (/already|exists|registered/i.test(mensagem)) return 'Este e-mail já está em uso.'
  return 'Não foi possível liberar o acesso ao aplicativo.'
}

export async function lerContaPorEmail(email: string, prestadorId: string | null): Promise<ContaEmail | null> {
  const admin = clienteServico()
  if (!admin) return null
  const { data: usuario } = await admin.from('usuarios').select('id, perfil, ativo').eq('email', email).maybeSingle()
  if (!usuario) return null
  const { data: dono } = await admin.from('prestadores').select('id').eq('usuario_id', usuario.id).maybeSingle()
  return {
    id: usuario.id,
    perfil: perfilDe(usuario.perfil),
    ativo: Boolean(usuario.ativo),
    vinculadoAOutro: Boolean(dono && dono.id !== prestadorId),
  }
}

export async function lerPerfilUsuario(id: string): Promise<PerfilConta | null> {
  const admin = clienteServico()
  if (!admin) return null
  const { data } = await admin.from('usuarios').select('perfil').eq('id', id).maybeSingle()
  return perfilDe(data?.perfil ?? null)
}

export function senhaNova() {
  return novaSenhaPrestador(() => randomBytes(3).toString('hex'))
}

export async function criarLoginPrestador(input: { nome: string; whatsapp: string; email: string }) {
  const admin = clienteServico()
  if (!admin) return { erro: 'Não foi possível liberar o acesso ao aplicativo.' as const }
  const senha = senhaNova()
  const credenciais = credenciaisPrestador(input.nome, input.whatsapp, input.email, senha)
  const { data, error } = await admin.auth.admin.createUser(credenciais)
  if (error || !data.user) return { erro: falhaAcesso(error?.message ?? '') }

  const perfil = await perfilGravado(admin, data.user.id)
  if (perfil !== 'prestador') {
    await admin.auth.admin.deleteUser(data.user.id)
    return { erro: 'Não foi possível liberar o acesso ao aplicativo.' as const }
  }
  return { id: data.user.id, senha }
}

export async function atualizarLoginPrestador(
  id: string,
  input: { nome: string; whatsapp: string; email: string; senha: string | null },
) {
  const admin = clienteServico()
  if (!admin) return { erro: 'Não foi possível liberar o acesso ao aplicativo.' as const }
  const credenciais = credenciaisPrestador(input.nome, input.whatsapp, input.email, input.senha ?? '')
  const { error } = await admin.auth.admin.updateUserById(id, {
    email: credenciais.email,
    email_confirm: true,
    app_metadata: credenciais.app_metadata,
    user_metadata: credenciais.user_metadata,
    ...(input.senha ? { password: input.senha, ban_duration: 'none' } : {}),
  })
  if (error) return { erro: falhaAcesso(error.message) }

  const { error: perfilErro } = await admin
    .from('usuarios')
    .update({ nome: input.nome, email: input.email, telefone: input.whatsapp, ativo: true })
    .eq('id', id)
    .eq('perfil', 'prestador')
  if (perfilErro) return { erro: 'Não foi possível liberar o acesso ao aplicativo.' as const }
  return { ok: true as const }
}

export async function desativarLoginPrestador(id: string) {
  const admin = clienteServico()
  if (!admin) return
  const { data } = await admin.from('usuarios').update({ ativo: false }).eq('id', id).eq('perfil', 'prestador').select('id')
  if (!data?.length) return
  await admin.auth.admin.updateUserById(id, { ban_duration: '876000h' })
}

export async function apagarLoginPrestador(id: string) {
  const admin = clienteServico()
  if (!admin) return
  await admin.auth.admin.deleteUser(id)
}

async function perfilGravado(admin: SupabaseClient, id: string) {
  const { data } = await admin.from('usuarios').select('perfil').eq('id', id).maybeSingle()
  return perfilDe(data?.perfil ?? null)
}

export async function gravarSenhaInicial(prestadorId: string, senha: string) {
  const jar = await cookies()
  jar.set(COOKIE, JSON.stringify({ id: prestadorId, senha }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/adm/prestadores',
    maxAge: 180,
    secure: process.env.NODE_ENV === 'production',
  })
}

export async function lerSenhaInicial(prestadorId: string) {
  const jar = await cookies()
  const bruto = jar.get(COOKIE)?.value
  if (!bruto) return null
  try {
    const dados = JSON.parse(bruto) as { id?: string; senha?: string }
    if (dados.id !== prestadorId || !dados.senha) return null
    return dados.senha
  } catch {
    return null
  }
}

export async function limparSenhaInicial() {
  const jar = await cookies()
  jar.set(COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/adm/prestadores',
    maxAge: 0,
  })
}
