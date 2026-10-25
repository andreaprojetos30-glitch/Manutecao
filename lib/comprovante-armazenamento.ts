import { idValido } from '@/lib/cadastros'

export const BUCKET_PDFS = 'pdfs'

export function caminhoComprovante(manutencaoId: string) {
  if (!idValido(manutencaoId)) return null
  const caminho = `${manutencaoId.toLowerCase()}/comprovante.pdf`
  if (caminho.includes('..') || caminho.includes('\\') || caminho.startsWith('/') || caminho.includes('://')) return null
  return caminho
}

export function pdfGerado(bytes: Uint8Array) {
  return bytes.byteLength >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
}

type BucketPrivado = {
  from(bucket: typeof BUCKET_PDFS): {
    upload(
      caminho: string,
      conteudo: Uint8Array,
      opcoes: { contentType: 'application/pdf'; upsert: false },
    ): Promise<{ error: { message: string } | null }>
  }
}

export function envioBucketPrivado(cliente: BucketPrivado) {
  return {
    async upload(caminho: string, conteudo: Uint8Array) {
      try {
        const { error } = await cliente.from(BUCKET_PDFS).upload(caminho, conteudo, {
          contentType: 'application/pdf',
          upsert: false,
        })
        if (error) return { erro: 'O comprovante não foi armazenado.' }
        return { erro: null }
      } catch {
        return { erro: 'O comprovante não foi armazenado.' }
      }
    },
  }
}

export async function armazenarComprovante(
  cliente: BucketPrivado,
  manutencaoId: string,
  pdf: Uint8Array,
) {
  const caminho = caminhoComprovante(manutencaoId)
  if (!caminho) return { erro: 'Manutenção não encontrada.', caminho: null }
  if (!pdfGerado(pdf)) return { erro: 'O comprovante não pôde ser gerado.', caminho: null }

  const envio = await envioBucketPrivado(cliente).upload(caminho, pdf)
  if (envio.erro) return { erro: envio.erro, caminho: null }
  return { erro: null, caminho }
}
