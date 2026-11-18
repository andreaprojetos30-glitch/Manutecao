import type { SupabaseClient } from '@supabase/supabase-js'
import { idValido } from '@/lib/cadastros'
import { extensaoFoto, TAMANHO_MAXIMO_FOTO, validarFoto } from '@/lib/execucao'

export const BUCKET_FOTOS = 'fotos'
export const ERRO_FOTO_NAO_ENVIADA = 'A foto não foi enviada. Verifique a conexão e tente de novo.'

const EXTENSOES_CAMINHO = ['jpg', 'png', 'webp', 'heic', 'heif']

export async function assinarFoto(supabase: SupabaseClient, caminho: string | null | undefined) {
  const foto = (caminho ?? '').trim()
  if (!foto || foto.includes('..') || foto.startsWith('/') || foto.startsWith('http')) return null
  const { data, error } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrl(foto, 60 * 30)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export function montarCaminhoFoto(manutencaoId: string, itemId: string, nome: string, marco: number) {
  const manutencao = manutencaoId.trim().toLowerCase()
  const item = itemId.trim().toLowerCase()
  if (!idValido(manutencao) || !idValido(item)) return null
  if (!Number.isInteger(marco) || marco < 1_000_000_000_000 || marco > 9_999_999_999_999) return null
  const extensao = extensaoFoto(nome)
  if (!EXTENSOES_CAMINHO.includes(extensao)) return null
  return `${manutencao}/${item}-${marco}.${extensao}`
}

export function caminhoFotoPermitido(manutencaoId: string, itemId: string, caminho: string) {
  const manutencao = manutencaoId.trim().toLowerCase()
  const item = itemId.trim().toLowerCase()
  if (!idValido(manutencao) || !idValido(item)) return false
  if (!caminho || caminho !== caminho.trim() || caminho.includes('..') || caminho.includes('\\') || caminho.includes('//')) {
    return false
  }
  const partes = caminho.split('/')
  if (partes.length !== 2) return false
  const [pasta, arquivo] = partes
  if (pasta !== manutencao) return false
  const prefixo = `${item}-`
  if (!arquivo.startsWith(prefixo)) return false
  const resto = arquivo.slice(prefixo.length)
  const ponto = resto.lastIndexOf('.')
  if (ponto <= 0) return false
  const marca = resto.slice(0, ponto)
  const extensao = resto.slice(ponto + 1)
  if (!/^[0-9]{13}$/.test(marca)) return false
  return EXTENSOES_CAMINHO.includes(extensao)
}

export function tipoConteudoFoto(nome: string, tipo: string) {
  if (validarFoto({ size: 1, type: tipo, name: nome }, false)) return ''
  const informado = tipo.toLowerCase().split(';')[0].trim()
  if (informado.startsWith('image/') && informado !== 'image/svg+xml') return informado
  const extensao = extensaoFoto(nome)
  if (extensao === 'png') return 'image/png'
  if (extensao === 'webp') return 'image/webp'
  if (extensao === 'heic') return 'image/heic'
  if (extensao === 'heif') return 'image/heif'
  return 'image/jpeg'
}

export function avaliarInfoFoto(info: { size: number; contentType: string } | null) {
  if (!info) return { ok: false as const, erro: ERRO_FOTO_NAO_ENVIADA, apagar: false }
  if (!Number.isFinite(info.size) || info.size <= 0 || info.size > TAMANHO_MAXIMO_FOTO) {
    return { ok: false as const, erro: 'A foto passou do tamanho permitido.', apagar: true }
  }
  const tipo = info.contentType.toLowerCase().split(';')[0].trim()
  if (!tipo.startsWith('image/') || tipo === 'image/svg+xml') {
    return { ok: false as const, erro: 'A foto precisa ser uma imagem.', apagar: true }
  }
  return { ok: true as const, erro: '', apagar: false }
}

export function infoFotoDe(
  data: { size?: number | null; contentType?: string | null; content_type?: string | null } | null | undefined,
) {
  if (!data || typeof data.size !== 'number' || !Number.isFinite(data.size)) return null
  const tipo = typeof data.contentType === 'string' ? data.contentType : data.content_type
  if (typeof tipo !== 'string' || !tipo.trim()) return null
  return { size: data.size, contentType: tipo }
}

type DestinoFoto = {
  uploadToSignedUrl(
    caminho: string,
    token: string,
    arquivo: Blob,
    opcoes: { contentType: string; upsert: false },
  ): Promise<{ error: { message?: string } | null }>
}

export async function enviarFotoDireta(
  destino: DestinoFoto,
  envio: { caminho: string; token: string },
  arquivo: Blob,
  tipo: string,
) {
  if (!envio.caminho || !envio.token || !tipo || arquivo.size <= 0) return false
  const corpo = arquivo.type === tipo ? arquivo : new Blob([arquivo], { type: tipo })
  const { error } = await destino.uploadToSignedUrl(envio.caminho, envio.token, corpo, {
    contentType: tipo,
    upsert: false,
  })
  return !error
}
