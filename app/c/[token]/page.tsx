import { CartaoConfirmacao, CartaoIndisponivel } from '@/app/c/CartaoLink'
import { tokenConfirmacaoValido, vistaPublica } from '@/lib/confirmacao-sindico'
import { lerPaginaConfirmacao } from '@/lib/confirmacao-sindico-dados'

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
  if (!tokenConfirmacaoValido(token)) return <CartaoIndisponivel />

  const pagina = await lerPaginaConfirmacao(token)
  if (!pagina) return <CartaoIndisponivel />
  const vista = vistaPublica(pagina)

  return (
    <CartaoConfirmacao
      token={token}
      condominio={vista.condominio}
      titulo={vista.titulo}
      dataEfetiva={vista.dataEfetiva}
      confirmadoEm={vista.confirmadoEm}
      avisoSindico={!vista.confirmadoEm && query.aviso === 'sindico'}
    />
  )
}
