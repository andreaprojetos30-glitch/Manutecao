import { Sair } from '@/app/componentes/Sair'
import { exigirDestino } from '@/lib/sessao'

export const dynamic = 'force-dynamic'

export default async function AdmPage() {
  const sessao = await exigirDestino('/adm')

  return (
    <main className="pagina">
      <section className="cartao">
        <p className="marca">ELEVA</p>
        <h1>Área do ADM</h1>
        <p className="subtitulo">Olá, {sessao.nome}.</p>
        <p className="perfil">Perfil: ADM ELEVA</p>
        <p className="subtitulo">Cadastros e agenda serão abertos por aqui.</p>
        <Sair />
      </section>
    </main>
  )
}
