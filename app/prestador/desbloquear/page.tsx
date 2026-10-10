import { desbloquearComPin } from '@/app/prestador/acesso'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Moldura } from '@/app/componentes/Moldura'
import { celularDesbloqueado, lerEstadoPin } from '@/lib/prestador-login'
import { exigirDestino } from '@/lib/sessao'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Desbloquear · ELEVA Manutenção' }

function hora(ms: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(ms)
}

export default async function DesbloquearPage({
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
  if (!estado?.pinDefinido) redirect('/prestador/pin')
  if (await celularDesbloqueado(user.id)) redirect('/prestador')

  const query = await searchParams
  const pausa = query.erro === 'pausa' || Boolean(estado.bloqueadoAte)

  return (
    <Moldura>
      <section className="cartao">
        <h1>Desbloquear</h1>
        <p className="subtitulo">Digite o PIN de 3 números deste celular.</p>
        {pausa ? (
          <p className="aviso">
            Muitas tentativas. Tente de novo
            {estado.bloqueadoAte ? ` depois das ${hora(estado.bloqueadoAte)}` : ' mais tarde'}.
          </p>
        ) : null}
        {query.erro === 'incorreto' && !pausa ? <p className="aviso">PIN incorreto.</p> : null}
        {query.erro === 'config' ? <p className="aviso">Não foi possível preparar o acesso. Procure a ELEVA.</p> : null}
        {pausa ? null : (
          <form action={desbloquearComPin}>
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
            <BotaoSubmit pendenteTexto="Conferindo…">Abrir</BotaoSubmit>
          </form>
        )}
      </section>
    </Moldura>
  )
}
