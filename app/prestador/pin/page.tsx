import { definirPin } from '@/app/prestador/acesso'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Moldura } from '@/app/componentes/Moldura'
import { celularDesbloqueado, lerEstadoPin } from '@/lib/prestador-login'
import { exigirDestino } from '@/lib/sessao'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Criar PIN · ELEVA Manutenção' }

const mensagens: Record<string, string> = {
  pin: 'O PIN precisa ter 3 números e a repetição precisa ser igual.',
  config: 'Não foi possível preparar o acesso. Procure a ELEVA.',
}

export default async function PinPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  await exigirDestino('/prestador')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const estado = await lerEstadoPin(user.id)
  if (!estado) {
    return (
      <Moldura>
        <section className="cartao">
          <h1>Criar PIN</h1>
          <p className="aviso">{mensagens.config}</p>
        </section>
      </Moldura>
    )
  }
  if (estado.pinDefinido) {
    redirect((await celularDesbloqueado(user.id)) ? '/prestador' : '/prestador/desbloquear')
  }

  const query = await searchParams
  const erro = query.erro ? mensagens[query.erro] : null

  return (
    <Moldura>
      <section className="cartao">
        <h1>Criar PIN</h1>
        <p className="subtitulo">Escolha 3 números para abrir o aplicativo neste celular. A ELEVA não fica com esse PIN.</p>
        {erro ? <p className="aviso">{erro}</p> : null}
        <form action={definirPin}>
          <label>
            PIN
            <input
              name="pin"
              className="pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              required
              minLength={3}
              maxLength={3}
              pattern="[0-9]{3}"
            />
          </label>
          <label>
            Repetir PIN
            <input
              name="repetir"
              className="pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              required
              minLength={3}
              maxLength={3}
              pattern="[0-9]{3}"
            />
          </label>
          <BotaoSubmit pendenteTexto="Guardando…">Guardar PIN</BotaoSubmit>
        </form>
      </section>
    </Moldura>
  )
}
