import { CartaoIndisponivel } from '@/app/c/CartaoLink'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Confirmação · ELEVA Manutenção',
  robots: { index: false, follow: false },
}

export default function LinkIndisponivelPage() {
  return <CartaoIndisponivel />
}
