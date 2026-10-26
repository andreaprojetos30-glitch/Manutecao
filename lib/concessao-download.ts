import { createHmac, timingSafeEqual } from 'node:crypto'
import { idValido } from '@/lib/cadastros'

export const PRAZO_CONCESSAO_SEGUNDOS = 30 * 60
export const NOME_COOKIE_CONCESSAO = 'eleva_baixa'

export function emitirConcessao(manutencaoId: string, agoraSegundos: number, segredo: string) {
  if (!idValido(manutencaoId) || !segredo || !Number.isSafeInteger(agoraSegundos)) return null
  const exp = agoraSegundos + PRAZO_CONCESSAO_SEGUNDOS
  const corpo = corpoConcessao(manutencaoId, exp)
  if (!corpo) return null
  return `${corpo}.${assinar(corpo, segredo)}`
}

export function abrirConcessao(valor: string, agoraSegundos: number, segredo: string) {
  if (!segredo || !Number.isSafeInteger(agoraSegundos)) return null
  const partes = valor.split('.')
  if (partes.length !== 4) return null
  const [versao, manutencaoId, expTexto, assinatura] = partes
  if (versao !== 'v1' || !idValido(manutencaoId) || !/^\d+$/.test(expTexto) || !assinatura) return null
  const exp = Number(expTexto)
  if (!Number.isSafeInteger(exp)) return null
  if (exp - agoraSegundos > PRAZO_CONCESSAO_SEGUNDOS || agoraSegundos >= exp) return null
  const corpo = corpoConcessao(manutencaoId, exp)
  if (!corpo) return null
  const esperada = assinar(corpo, segredo)
  const recebida = Buffer.from(assinatura)
  const correta = Buffer.from(esperada)
  if (recebida.length !== correta.length || !timingSafeEqual(recebida, correta)) return null
  return { manutencaoId: manutencaoId.toLowerCase(), exp }
}

export function opcoesCookieConcessao(token: string, seguro: boolean) {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: seguro,
    path: `/c/${token}`,
    maxAge: PRAZO_CONCESSAO_SEGUNDOS,
  }
}

function corpoConcessao(manutencaoId: string, exp: number) {
  const id = manutencaoId.toLowerCase()
  if (!idValido(id) || !Number.isSafeInteger(exp)) return null
  return `v1.${id}.${exp}`
}

function assinar(corpo: string, segredo: string) {
  return createHmac('sha256', segredo).update(corpo).digest('base64url')
}
