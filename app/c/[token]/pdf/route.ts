import { concessaoDoPedido, pdfDoLink } from '@/lib/confirmacao-sindico-dados'

export const dynamic = 'force-dynamic'

export async function GET(_pedido: Request, contexto: { params: Promise<{ token: string }> }) {
  const { token } = await contexto.params
  const pdf = await pdfDoLink(token, await concessaoDoPedido())
  if (!pdf) {
    return new Response('Comprovante indisponível.', {
      status: 404,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  }

  const disposicao = pdf.disposicao === 'attachment' ? 'attachment' : 'inline'
  return new Response(Buffer.from(pdf.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposicao}; filename="comprovante.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
