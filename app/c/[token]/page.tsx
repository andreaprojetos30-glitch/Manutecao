import { CartaoConfirmacao, CartaoEncerrado, CartaoIndisponivel } from '@/app/c/CartaoLink'
import { vistaPublica } from '@/lib/confirmacao-sindico'
import { lerLinkPublico } from '@/lib/confirmacao-sindico-dados'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Confirmação · ELEVA Manutenção',
  robots: { index: false, follow: false },
}

export default async function ConfirmacaoSindicoPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ aviso?: string }>
}) {
  const { token } = await params
  const query = await searchParams
  const leitura = await lerLinkPublico(token)
  if (!leitura) return <CartaoIndisponivel />
  if (leitura.estado === 'encerrada') return <CartaoEncerrado />

  const vista = vistaPublica(leitura.pagina)
  return (
    <CartaoConfirmacao
      token={token}
      condominio={vista.condominio}
      titulo={vista.titulo}
      dataEfetiva={vista.dataEfetiva}
      avisoSindico={query.aviso === 'sindico'}
    />
  )
}
