import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { credenciaisPrestador, type ContaEmail, type PerfilConta } from '@/lib/acesso-prestador'
import {
  acessoLiberado,
  assinarDesbloqueio,
  ATIVACAO_MS,
  contaTentativas,
  DESBLOQUEIO_MS,
  hashAtivacao,
  lerDesbloqueio,
  novoTokenAtivacao,
  tokenAtivacaoValido,
  type ContaTentativas,
} from '@/lib/desbloqueio'

const COOKIE_ATIVACAO = 'eleva_ativacao_prestador'
const COOKIE_DESBLOQUEIO = 'eleva_desbloqueio'

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

function opcoesCookie(caminho: string, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: caminho,
    maxAge,
    secure: process.env.NODE_ENV === 'production',
  }
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

export async function criarLoginPrestador(input: {
  nome: string
  whatsapp: string
  email: string
}): Promise<{ id: string } | { erro: string }> {
  const admin = clienteServico()
  if (!admin) return { erro: 'Não foi possível liberar o acesso ao aplicativo.' as const }
  const senha = randomBytes(32).toString('base64url')
  const credenciais = credenciaisPrestador(input.nome, input.whatsapp, input.email, senha)
  const { data, error } = await admin.auth.admin.createUser(credenciais)
  if (error || !data.user) return { erro: falhaAcesso(error?.message ?? '') }

  const perfil = await perfilGravado(admin, data.user.id)
  if (perfil !== 'prestador') {
    await admin.auth.admin.deleteUser(data.user.id)
    return { erro: 'Não foi possível liberar o acesso ao aplicativo.' as const }
  }
  const { error: bloqueio } = await admin.auth.admin.updateUserById(data.user.id, { ban_duration: '876000h' })
  if (bloqueio) {
    await admin.auth.admin.deleteUser(data.user.id)
    return { erro: 'Não foi possível liberar o acesso ao aplicativo.' as const }
  }
  return { id: data.user.id }
}

export async function atualizarLoginPrestador(
  id: string,
  input: { nome: string; whatsapp: string; email: string; senha: string | null },
): Promise<{ ok: true } | { erro: string }> {
  const admin = clienteServico()
  if (!admin) return { erro: 'Não foi possível liberar o acesso ao aplicativo.' as const }
  const credenciais = credenciaisPrestador(input.nome, input.whatsapp, input.email, input.senha ?? '')
  const { error } = await admin.auth.admin.updateUserById(id, {
    email: credenciais.email,
    email_confirm: true,
    app_metadata: credenciais.app_metadata,
    user_metadata: credenciais.user_metadata,
    ...(input.senha ? { password: input.senha } : {}),
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

async function revogarSessoes(usuarioId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return
  try {
    await fetch(`${url}/auth/v1/admin/users/${usuarioId}/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chave}`,
        apikey: chave,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'global' }),
    })
  } catch {
    // O banimento já impede renovar a sessão.
  }
}

export async function suspenderLogin(usuarioId: string): Promise<{ ok: true } | { erro: string }> {
  const admin = clienteServico()
  if (!admin) return { erro: 'Não foi possível revogar o acesso ao aplicativo.' as const }
  const senha = randomBytes(32).toString('base64url')
  const { error } = await admin.auth.admin.updateUserById(usuarioId, { password: senha, ban_duration: '876000h' })
  if (error) return { erro: 'Não foi possível revogar o acesso ao aplicativo.' as const }
  await revogarSessoes(usuarioId)
  return { ok: true as const }
}

export async function emitirAtivacao(
  prestadorId: string,
  usuarioId: string,
): Promise<{ token: string } | { erro: string }> {
  const admin = clienteServico()
  if (!admin) return { erro: 'Não foi possível gerar a ativação.' as const }
  const suspenso = await suspenderLogin(usuarioId)
  if ('erro' in suspenso) return { erro: 'Não foi possível gerar a ativação.' as const }
  const token = novoTokenAtivacao()
  const { error } = await admin.from('prestador_acesso').upsert({
    prestador_id: prestadorId,
    ativacao_hash: hashAtivacao(token),
    ativacao_expira_em: new Date(Date.now() + ATIVACAO_MS).toISOString(),
    ativado_em: null,
    pin_hash: null,
    selo: null,
    tentativas: 0,
    bloqueios: 0,
    bloqueado_ate: null,
  })
  if (error) return { erro: 'Não foi possível gerar a ativação.' as const }
  return { token }
}

export async function revogarAcessoPrestador(prestadorId: string, usuarioId: string | null) {
  const admin = clienteServico()
  if (!admin) return
  if (usuarioId) await suspenderLogin(usuarioId)
  await admin.from('prestador_acesso').delete().eq('prestador_id', prestadorId)
}

export async function lerSituacaoAcesso(prestadorId: string, temLogin: boolean) {
  const vazio = { temLogin, pinDefinido: false, ativacaoPendente: false, ativacaoExpirada: false }
  if (!temLogin) return vazio
  const admin = clienteServico()
  if (!admin) return vazio
  const { data } = await admin
    .from('prestador_acesso')
    .select('pin_hash, ativacao_hash, ativacao_expira_em')
    .eq('prestador_id', prestadorId)
    .maybeSingle()
  if (!data) return vazio
  const expira = data.ativacao_expira_em ? Date.parse(data.ativacao_expira_em) : 0
  const pendente = Boolean(data.ativacao_hash) && expira > Date.now()
  return {
    temLogin: true,
    pinDefinido: Boolean(data.pin_hash),
    ativacaoPendente: pendente,
    ativacaoExpirada: Boolean(data.ativacao_hash) && !pendente,
  }
}

export type AcessoOperacional = {
  prestadorId: string
  pinHash: string | null
  selo: string | null
  tentativas: number
  bloqueios: number
  bloqueadoAte: string | null
}

export async function lerAcessoOperacional(usuarioId: string): Promise<AcessoOperacional | null> {
  const admin = clienteServico()
  if (!admin) return null
  const { data: prestador } = await admin.from('prestadores').select('id').eq('usuario_id', usuarioId).maybeSingle()
  if (!prestador) return null
  const { data } = await admin
    .from('prestador_acesso')
    .select('pin_hash, selo, tentativas, bloqueios, bloqueado_ate')
    .eq('prestador_id', prestador.id)
    .maybeSingle()
  return {
    prestadorId: prestador.id,
    pinHash: data?.pin_hash ?? null,
    selo: data?.selo ?? null,
    tentativas: data?.tentativas ?? 0,
    bloqueios: data?.bloqueios ?? 0,
    bloqueadoAte: data?.bloqueado_ate ?? null,
  }
}

export async function lerEstadoPin(usuarioId: string) {
  const acesso = await lerAcessoOperacional(usuarioId)
  if (!acesso) return null
  const conta = contaTentativas({
    tentativas: acesso.tentativas,
    bloqueios: acesso.bloqueios,
    bloqueado_ate: acesso.bloqueadoAte,
  })
  const bloqueadoAte = conta.bloqueadoAte !== null && conta.bloqueadoAte > Date.now() ? conta.bloqueadoAte : null
  return { pinDefinido: Boolean(acesso.pinHash), bloqueadoAte }
}

export async function buscarAtivacao(token: string) {
  if (!tokenAtivacaoValido(token)) return null
  const admin = clienteServico()
  if (!admin) return null
  const hash = hashAtivacao(token)
  const { data } = await admin
    .from('prestador_acesso')
    .select('prestador_id, ativacao_expira_em')
    .eq('ativacao_hash', hash)
    .maybeSingle()
  if (!data?.ativacao_expira_em || Date.parse(data.ativacao_expira_em) <= Date.now()) return null
  const { data: prestador } = await admin
    .from('prestadores')
    .select('id, usuario_id, ativo')
    .eq('id', data.prestador_id)
    .maybeSingle()
  if (!prestador?.usuario_id || !prestador.ativo) return null
  const { data: usuario } = await admin
    .from('usuarios')
    .select('perfil, ativo')
    .eq('id', prestador.usuario_id)
    .maybeSingle()
  if (!usuario || usuario.perfil !== 'prestador' || !usuario.ativo) return null
  return { prestadorId: prestador.id, usuarioId: prestador.usuario_id, hash }
}

export async function consumirAtivacao(prestadorId: string, hash: string) {
  const admin = clienteServico()
  if (!admin) return false
  const { data, error } = await admin
    .from('prestador_acesso')
    .update({
      ativacao_hash: null,
      ativacao_expira_em: null,
      ativado_em: new Date().toISOString(),
      pin_hash: null,
      selo: null,
      tentativas: 0,
      bloqueios: 0,
      bloqueado_ate: null,
    })
    .eq('prestador_id', prestadorId)
    .eq('ativacao_hash', hash)
    .select('prestador_id')
  return !error && Boolean(data?.length)
}

export async function prepararEntrada(usuarioId: string): Promise<{ email: string; senha: string } | { erro: string }> {
  const admin = clienteServico()
  if (!admin) return { erro: 'Não foi possível ativar o acesso.' as const }
  const { data: usuario } = await admin.from('usuarios').select('email, perfil, ativo').eq('id', usuarioId).maybeSingle()
  if (!usuario?.email || usuario.perfil !== 'prestador' || !usuario.ativo) {
    return { erro: 'Não foi possível ativar o acesso.' as const }
  }
  const senha = randomBytes(32).toString('base64url')
  const { error } = await admin.auth.admin.updateUserById(usuarioId, { password: senha, ban_duration: 'none' })
  if (error) return { erro: 'Não foi possível ativar o acesso.' as const }
  return { email: usuario.email, senha }
}

export async function salvarPinInicial(prestadorId: string, pinHash: string, selo: string) {
  const admin = clienteServico()
  if (!admin) return false
  const { data: atual } = await admin.from('prestador_acesso').select('pin_hash').eq('prestador_id', prestadorId).maybeSingle()
  if (atual?.pin_hash) return false
  if (!atual) {
    const { error } = await admin.from('prestador_acesso').insert({
      prestador_id: prestadorId,
      pin_hash: pinHash,
      selo,
      tentativas: 0,
      bloqueios: 0,
    })
    return !error
  }
  const { data, error } = await admin
    .from('prestador_acesso')
    .update({
      pin_hash: pinHash,
      selo,
      tentativas: 0,
      bloqueios: 0,
      bloqueado_ate: null,
      ativacao_hash: null,
      ativacao_expira_em: null,
    })
    .eq('prestador_id', prestadorId)
    .is('pin_hash', null)
    .select('prestador_id')
  return !error && Boolean(data?.length)
}

export async function gravarTentativas(prestadorId: string, antes: ContaTentativas, depois: ContaTentativas) {
  const admin = clienteServico()
  if (!admin) return false
  const { data, error } = await admin
    .from('prestador_acesso')
    .update({
      tentativas: depois.tentativas,
      bloqueios: depois.bloqueios,
      bloqueado_ate: depois.bloqueadoAte ? new Date(depois.bloqueadoAte).toISOString() : null,
    })
    .eq('prestador_id', prestadorId)
    .eq('tentativas', antes.tentativas)
    .eq('bloqueios', antes.bloqueios)
    .select('prestador_id')
  return !error && Boolean(data?.length)
}

export async function bloquearAcessoPorTentativas(
  prestadorId: string,
  usuarioId: string,
): Promise<{ ok: true } | { erro: string }> {
  const suspenso = await suspenderLogin(usuarioId)
  if ('erro' in suspenso) return suspenso
  const admin = clienteServico()
  if (!admin) return { erro: 'Não foi possível bloquear o acesso.' as const }
  const { error } = await admin
    .from('prestador_acesso')
    .update({
      ativacao_hash: null,
      ativacao_expira_em: null,
      ativado_em: null,
      pin_hash: null,
      selo: null,
      tentativas: 0,
      bloqueios: 0,
      bloqueado_ate: null,
    })
    .eq('prestador_id', prestadorId)
  if (error) return { erro: 'Não foi possível bloquear o acesso.' as const }
  return { ok: true as const }
}

export async function gravarAtivacao(prestadorId: string, token: string) {
  const jar = await cookies()
  jar.set(COOKIE_ATIVACAO, JSON.stringify({ id: prestadorId, token }), opcoesCookie('/adm/prestadores', 30 * 60))
}

export async function lerAtivacao(prestadorId: string) {
  const jar = await cookies()
  const bruto = jar.get(COOKIE_ATIVACAO)?.value
  if (!bruto) return null
  try {
    const dados = JSON.parse(bruto) as { id?: string; token?: string }
    if (dados.id !== prestadorId || !dados.token || !tokenAtivacaoValido(dados.token)) return null
    return dados.token
  } catch {
    return null
  }
}

export async function limparAtivacao() {
  const jar = await cookies()
  jar.set(COOKIE_ATIVACAO, '', opcoesCookie('/adm/prestadores', 0))
}

export async function gravarDesbloqueio(usuarioId: string, selo: string) {
  const segredo = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!segredo) return false
  const expira = Date.now() + DESBLOQUEIO_MS
  const jar = await cookies()
  jar.set(
    COOKIE_DESBLOQUEIO,
    assinarDesbloqueio(usuarioId, selo, expira, segredo),
    opcoesCookie('/prestador', Math.floor(DESBLOQUEIO_MS / 1000)),
  )
  return true
}

export async function limparDesbloqueio() {
  const jar = await cookies()
  jar.set(COOKIE_DESBLOQUEIO, '', opcoesCookie('/prestador', 0))
}

export async function celularDesbloqueado(usuarioId: string) {
  const acesso = await lerAcessoOperacional(usuarioId)
  if (!acesso?.pinHash || !acesso.selo) return false
  const segredo = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!segredo) return false
  const jar = await cookies()
  const bruto = jar.get(COOKIE_DESBLOQUEIO)?.value
  if (!bruto) return false
  const cookie = lerDesbloqueio(bruto, segredo, Date.now())
  return acessoLiberado({ userId: usuarioId, selo: acesso.selo, cookie })
}
