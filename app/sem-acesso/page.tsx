import { Moldura } from '@/app/componentes/Moldura'
import { Sair } from '@/app/componentes/Sair'
import { exigirDestino } from '@/lib/sessao'

export const dynamic = 'force-dynamic'

export default async function SemAcessoPage() {
  const sessao = await exigirDestino('/sem-acesso')

  return (
    <Moldura>
      <section className="cartao">
        <h1>Sem acesso operacional</h1>
        <p className="subtitulo">Olá, {sessao.nome}.</p>
        <p className="aviso">
          Sua conta ainda não tem perfil de ADM ou prestador. A ELEVA precisa
          liberar o acesso.
        </p>
        <Sair />
      </section>
    </Moldura>
  )
}
