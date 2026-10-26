import { redirect } from 'next/navigation'
import { CartaoEncerrado, CartaoIndisponivel, CartaoPronto } from '@/app/c/CartaoLink'
import { tokenConfirmacaoValido } from '@/lib/confirmacao-sindico'
import { concessaoDoPedido, lerLinkPublico } from '@/lib/confirmacao-sindico-dados'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Confirmação · ELEVA Manutenção',
  robots: { index: false, follow: false },
}

export default async function ConfirmacaoProntaPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!tokenConfirmacaoValido(token)) return <CartaoIndisponivel />

  const leitura = await lerLinkPublico(token)
  if (!leitura) return <CartaoIndisponivel />
  if (leitura.estado === 'aberta') redirect(`/c/${token}`)

  const concessao = await concessaoDoPedido()
  if (!concessao || concessao.manutencaoId !== leitura.manutencaoId.toLowerCase()) {
    return <CartaoEncerrado />
  }
  return <CartaoPronto token={token} />
}
