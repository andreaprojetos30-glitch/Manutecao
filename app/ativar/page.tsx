import { Moldura } from '@/app/componentes/Moldura'

export const metadata = { title: 'Ativar acesso · ELEVA Manutenção' }

export default async function AtivarPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const params = await searchParams
  return (
    <Moldura>
      <section className="cartao">
        <h1>Ativar acesso</h1>
        <p className="subtitulo">Abra o link de ativação enviado pela ELEVA.</p>
        {params.erro === 'config' ? <p className="aviso">O Supabase ainda não está configurado neste ambiente.</p> : null}
        {params.erro === 'ativacao' ? (
          <p className="aviso">Este link de ativação não vale mais. Peça um novo à ELEVA.</p>
        ) : null}
      </section>
    </Moldura>
  )
}
