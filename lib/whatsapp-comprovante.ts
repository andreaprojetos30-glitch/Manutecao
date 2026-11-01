import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { IDENTIFICACAO_ELEVA } from '@/lib/comprovante'
import { tokenConfirmacaoValido } from '@/lib/confirmacao-sindico'

export const ORIGEM_LABORATORIO_WHATSAPP = 'https://manutencao.eleva.example'
const MARCA_CIFRA = 'v1'

const HOSTS_PROIBIDOS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '[::1]'])

export function hashSha256Token(token: string) {
  return `sha256$${createHash('sha256').update(token).digest('base64url')}`
}

export function hashTokenConfirmacao(token: string) {
  if (!tokenConfirmacaoValido(token)) return null
  return hashSha256Token(token)
}

export function chaveTokenLink(valor: string | undefined) {
  const texto = valor?.trim() ?? ''
  if (!texto || texto.length > 80) return null
  const bytes = Buffer.from(texto, 'base64')
  if (bytes.length !== 32) return null
  return bytes
}

export function cifrarTokenLink(token: string, chave: Buffer, hash: string) {
  if (chave.length !== 32 || !tokenConfirmacaoValido(token) || hashTokenConfirmacao(token) !== hash) return null
  const iv = randomBytes(12)
  const cifra = createCipheriv('aes-256-gcm', chave, iv)
  cifra.setAAD(Buffer.from(hash))
  const corpo = Buffer.concat([cifra.update(token, 'utf8'), cifra.final()])
  const bloco = Buffer.concat([iv, cifra.getAuthTag(), corpo]).toString('base64url')
  if (bloco.includes(token) || bloco.includes(hash)) return null
  return `${MARCA_CIFRA}.${bloco}`
}

export function decifrarTokenLink(bloco: string, chave: Buffer, hash: string) {
  if (chave.length !== 32 || !bloco.startsWith(`${MARCA_CIFRA}.`) || !hash.startsWith('sha256$')) return null
  const bruto = Buffer.from(bloco.slice(MARCA_CIFRA.length + 1), 'base64url')
  if (bruto.length < 12 + 16 + 1) return null
  try {
    const decifra = createDecipheriv('aes-256-gcm', chave, bruto.subarray(0, 12))
    decifra.setAAD(Buffer.from(hash))
    decifra.setAuthTag(bruto.subarray(12, 28))
    const token = Buffer.concat([decifra.update(bruto.subarray(28)), decifra.final()]).toString('utf8')
    if (hashTokenConfirmacao(token) !== hash) return null
    return token
  } catch {
    return null
  }
}

export function telefoneWhatsapp(valor: string) {
  const digitos = valor.replace(/\D/g, '')
  if (/^55\d{10,11}$/.test(digitos)) return digitos
  if (/^\d{10,11}$/.test(digitos)) return `55${digitos}`
  return null
}

export function avaliarOrigemPublica(configurada: string | undefined, hostPedido: string) {
  let url: URL
  try {
    url = new URL(configurada ?? '')
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null
  if (url.pathname !== '/' && url.pathname !== '') return null
  const host = url.hostname.toLowerCase()
  if (HOSTS_PROIBIDOS.has(host) || host.endsWith('.local') || host.endsWith('.localhost')) return null
  if (ipv4(host) || host.includes(':')) return null
  const origem = `https://${host}`
  if (origem === ORIGEM_LABORATORIO_WHATSAPP) return { origem, abrirWhatsapp: false }
  const pedido = hostPedido.split(',')[0]?.trim().toLowerCase().replace(/:\d+$/, '') ?? ''
  if (!pedido || pedido !== host) return null
  return { origem, abrirWhatsapp: true }
}

export function mensagemWhatsapp(condominio: string, url: string, lembrete = false) {
  const nome = condominio.trim()
  if (!nome || !url.startsWith('https://') || /localhost|127\.0\.0\.1|\[::1\]/i.test(url)) return null
  const corpo = lembrete
    ? [
        `Olá. O comprovante da manutenção no ${nome} continua aguardando confirmação.`,
        'Este é um lembrete do envio já realizado. O link segue o mesmo.',
        url,
      ]
    : [
        `Olá. Segue o comprovante da manutenção no ${nome}.`,
        url,
        '',
        'Pedimos a confirmação do recebimento neste link.',
      ]
  return [IDENTIFICACAO_ELEVA, '', ...corpo].join('\n')
}

export function destinoWhatsapp(telefone: string, mensagem: string) {
  if (!/^55\d{10,11}$/.test(telefone) || !mensagem.startsWith(IDENTIFICACAO_ELEVA)) return null
  return `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`
}

function ipv4(host: string) {
  const partes = host.split('.')
  if (partes.length !== 4) return false
  return partes.every((parte) => /^\d{1,3}$/.test(parte) && Number(parte) <= 255)
}
