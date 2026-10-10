import { ativarComLink } from '@/app/ativar/acoes'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Moldura } from '@/app/componentes/Moldura'
import { tokenAtivacaoValido } from '@/lib/desbloqueio'
import { supabaseConfigurado } from '@/lib/supabase/ambiente'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ativar acesso · ELEVA Manutenção' }

export default async function AtivarTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const { token } = await params
  const query = await searchParams
  const valido = tokenAtivacaoValido(token)
  const configurado = supabaseConfigurado()

  return (
    <Moldura>
      <section className="cartao">
        <h1>Ativar acesso</h1>
        <p className="subtitulo">Este celular fica conectado. Em seguida você escolhe um PIN de 3 números.</p>
        {!valido || query.erro === 'ativacao' ? (
          <p className="aviso">Este link de ativação não vale mais. Peça um novo à ELEVA.</p>
        ) : null}
        {!configurado ? <p className="aviso">O Supabase ainda não está configurado neste ambiente.</p> : null}
        {query.erro === 'celular' ? (
          <p className="aviso">Abra este link no celular do prestador. No computador da ELEVA o acesso de administrador continua o mesmo.</p>
        ) : null}
        {valido && configurado && query.erro !== 'ativacao' && query.erro !== 'celular' ? (
          <form action={ativarComLink}>
            <input type="hidden" name="token" value={token} />
            <p className="nota">A ELEVA não vê o PIN. O link funciona uma vez.</p>
            <BotaoSubmit pendenteTexto="Ativando…">Ativar meu acesso</BotaoSubmit>
          </form>
        ) : null}
      </section>
    </Moldura>
  )
}
