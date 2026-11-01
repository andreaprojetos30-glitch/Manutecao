import { carregarRecursosComprovante } from '@/lib/comprovante-pdf'
import { idValido } from '@/lib/cadastros'
import { caminhoDocumentoConfirmacao } from '@/lib/confirmacao-manual'
import {
  baixarDocumentoConfirmacao,
  garantirDocumentoDoAdm,
  guardarDocumentoConfirmacao,
  lerDocumentoDoAdm,
} from '@/lib/confirmacao-manual-dados'
import { gerarPdfConfirmacao } from '@/lib/confirmacao-pdf'
import { exigirDestino } from '@/lib/sessao'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(pedido: Request, contexto: { params: Promise<{ id: string }> }) {
  await exigirDestino('/adm')
  const { id } = await contexto.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const adminId = user?.id && idValido(user.id) ? user.id : ''
  const url = new URL(pedido.url)
  const origem = url.searchParams.get('origem')
  const registro = url.searchParams.get('registro')
  const peca = url.searchParams.get('peca')
  const codigoPedido = url.searchParams.get('codigo')
  if (!adminId || !idValido(id)) return indisponivel()

  let codigo = codigoPedido
  if (!codigo && origem === 'link') {
    const garantia = await garantirDocumentoDoAdm(adminId, id, 'link', null)
    if ('erro' in garantia) return indisponivel()
    codigo = garantia.garantia.codigo
  }
  if (!codigo && registro && idValido(registro)) {
    const garantia = await garantirDocumentoDoAdm(adminId, id, peca === 'declaracao' ? 'declaracao' : 'registro', registro)
    if ('erro' in garantia) return indisponivel()
    codigo = peca === 'declaracao' ? garantia.garantia.declaracaoCodigo : garantia.garantia.codigo
  }
  const caminho = codigo ? caminhoDocumentoConfirmacao(id, codigo) : null
  if (!codigo || !caminho) return indisponivel()

  const documento = await lerDocumentoDoAdm(adminId, id, codigo)
  if (!documento || documento.caminho !== caminho) return indisponivel()

  const guardado = await baixarDocumentoConfirmacao(caminho)
  if (guardado) return resposta(guardado, codigo)

  const gerado = await gerarPdfConfirmacao(documento, await carregarRecursosComprovante())
  if (gerado.erro || !gerado.pdf) return indisponivel()
  const envio = await guardarDocumentoConfirmacao(caminho, gerado.pdf)
  if (envio.erro) {
    const existente = await baixarDocumentoConfirmacao(caminho)
    if (existente) return resposta(existente, codigo)
    return indisponivel()
  }
  return resposta(gerado.pdf, codigo)
}

function resposta(pdf: Uint8Array, codigo: string) {
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${codigo}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function indisponivel() {
  return new Response('Comprovante de confirmação indisponível.', {
    status: 404,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}
