import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const TAMANHO = 32

export const LIMITE_TENTATIVAS = 5
export const LIMITE_BLOQUEIOS = 3
export const BLOQUEIO_MS = 15 * 60 * 1000
export const DESBLOQUEIO_MS = 12 * 60 * 60 * 1000
export const ATIVACAO_MS = 72 * 60 * 60 * 1000

export function pinAceito(valor: string) {
  return /^\d{3}$/.test(valor)
}

export function tokenAtivacaoValido(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token)
}

export function novoTokenAtivacao() {
  return randomBytes(32).toString('base64url')
}

export function hashAtivacao(token: string) {
  return createHash('sha256').update(token).digest('base64url')
}

export function linkAtivacao(origem: string, token: string) {
  if (!tokenAtivacaoValido(token)) return null
  const base = origem.replace(/\/$/, '')
  if (!base) return `/ativar/${token}`
  return `${base}/ativar/${token}`
}

export async function hashPin(pin: string) {
  if (!pinAceito(pin)) return null
  const salt = randomBytes(16)
  const hash = (await scryptAsync(pin, salt, TAMANHO)) as Buffer
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export async function conferirSegredo(pin: string, armazenado: string) {
  if (!pinAceito(pin) || !armazenado) return false
  const [algo, salt, hash] = armazenado.split('$')
  if (algo !== 'scrypt' || !salt || !hash) return false
  let calculado: Buffer
  try {
    calculado = (await scryptAsync(pin, Buffer.from(salt, 'base64url'), TAMANHO)) as Buffer
  } catch {
    return false
  }
  const esperado = Buffer.from(hash, 'base64url')
  if (calculado.length !== esperado.length) return false
  return timingSafeEqual(calculado, esperado)
}

export type ContaTentativas = {
  tentativas: number
  bloqueios: number
  bloqueadoAte: number | null
}

export type ResultadoPin =
  | { tipo: 'aguardar'; bloqueadoAte: number }
  | { tipo: 'liberado'; conta: ContaTentativas }
  | { tipo: 'recusado'; conta: ContaTentativas }
  | { tipo: 'revogar'; conta: ContaTentativas }

export function avaliarPin(conta: ContaTentativas, agora: number, correto: boolean): ResultadoPin {
  if (conta.bloqueadoAte !== null && conta.bloqueadoAte > agora) {
    return { tipo: 'aguardar', bloqueadoAte: conta.bloqueadoAte }
  }
  if (correto) {
    return { tipo: 'liberado', conta: { tentativas: 0, bloqueios: 0, bloqueadoAte: null } }
  }
  const tentativas = conta.tentativas + 1
  if (tentativas < LIMITE_TENTATIVAS) {
    return { tipo: 'recusado', conta: { tentativas, bloqueios: conta.bloqueios, bloqueadoAte: null } }
  }
  const bloqueios = conta.bloqueios + 1
  if (bloqueios >= LIMITE_BLOQUEIOS) {
    return { tipo: 'revogar', conta: { tentativas: 0, bloqueios: 0, bloqueadoAte: null } }
  }
  return {
    tipo: 'recusado',
    conta: { tentativas: 0, bloqueios, bloqueadoAte: agora + BLOQUEIO_MS },
  }
}

export function passoPrestador(input: { pinDefinido: boolean; desbloqueado: boolean }) {
  if (!input.pinDefinido) return 'definir-pin' as const
  if (!input.desbloqueado) return 'desbloquear' as const
  return 'operar' as const
}

export function acessoLiberado(input: {
  userId: string
  selo: string | null
  cookie: { userId: string; selo: string } | null
}) {
  if (!input.selo || !input.cookie) return false
  return input.cookie.userId === input.userId && input.cookie.selo === input.selo
}

export function assinarDesbloqueio(userId: string, selo: string, expira: number, segredo: string) {
  const corpo = `${userId}.${selo}.${expira}`
  const sig = createHmac('sha256', segredo).update(corpo).digest('base64url')
  return `${corpo}.${sig}`
}

export function lerDesbloqueio(valor: string, segredo: string, agora: number) {
  const partes = valor.split('.')
  if (partes.length !== 4) return null
  const [userId, selo, expiraTexto, sig] = partes
  const expira = Number(expiraTexto)
  if (!userId || !selo || !sig || !Number.isFinite(expira) || expira <= agora) return null
  const esperado = createHmac('sha256', segredo).update(`${userId}.${selo}.${expiraTexto}`).digest('base64url')
  const recebido = Buffer.from(sig)
  const calculado = Buffer.from(esperado)
  if (recebido.length !== calculado.length || !timingSafeEqual(recebido, calculado)) return null
  return { userId, selo, expira }
}

export function textoSituacaoAcesso(input: {
  temLogin: boolean
  pinDefinido: boolean
  ativacaoPendente: boolean
  ativacaoExpirada: boolean
}) {
  if (!input.temLogin) return 'Acesso ao aplicativo: Não'
  if (input.pinDefinido) return 'Acesso ao aplicativo: ativo no celular'
  if (input.ativacaoPendente) return 'Acesso ao aplicativo: aguardando ativação'
  if (input.ativacaoExpirada) return 'Acesso ao aplicativo: link expirado'
  return 'Acesso ao aplicativo: senha antiga, sem PIN'
}

export function novoSelo() {
  return randomBytes(16).toString('base64url')
}

export function contaTentativas(acesso: {
  tentativas: number
  bloqueios: number
  bloqueado_ate: string | null
}): ContaTentativas {
  const ate = acesso.bloqueado_ate ? Date.parse(acesso.bloqueado_ate) : Number.NaN
  return {
    tentativas: acesso.tentativas,
    bloqueios: acesso.bloqueios,
    bloqueadoAte: Number.isFinite(ate) ? ate : null,
  }
}
