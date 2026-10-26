import { createClient as criarServico } from '@supabase/supabase-js'
import { BUCKET_PDFS, caminhoLiberado, pdfGerado } from '@/lib/comprovante-armazenamento'
import { bytesDeDownload } from '@/lib/confirmacao-sindico'
import { exigirDestino } from '@/lib/sessao'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(_pedido: Request, contexto: { params: Promise<{ id: string }> }) {
  await exigirDestino('/adm')
  const { id } = await contexto.params
  const supabase = await createClient()
  const { data } = await supabase.from('manutencoes').select('pdf_url').eq('id', id).maybeSingle()
  const caminho = caminhoLiberado(data?.pdf_url, id)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!caminho || !url || !chave) return indisponivel()

  const servico = criarServico(url, chave, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: arquivo, error } = await servico.storage.from(BUCKET_PDFS).download(caminho)
  if (error || !arquivo) return indisponivel()
  const bytes = await bytesDeDownload(arquivo)
  if (!bytes || !pdfGerado(bytes)) return indisponivel()

  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="comprovante.pdf"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function indisponivel() {
  return new Response('Comprovante indisponível.', {
    status: 404,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}
