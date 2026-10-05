import { Moldura } from '@/app/componentes/Moldura'
import { Sair } from '@/app/componentes/Sair'
import { exigirDestino } from '@/lib/sessao'

export const dynamic = 'force-dynamic'

export default async function PrestadorPage() {
  const sessao = await exigirDestino('/prestador')

  return (
    <Moldura>
      <section className="cartao">
        <h1>Área do prestador</h1>
        <p className="subtitulo">Olá, {sessao.nome}.</p>
        <p className="perfil">Perfil: Prestador</p>
        <p className="subtitulo">As visitas atribuídas serão abertas por aqui.</p>
        <Sair />
      </section>
    </Moldura>
  )
}
