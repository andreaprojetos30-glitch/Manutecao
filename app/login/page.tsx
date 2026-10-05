import { entrar } from '@/app/acoes'
import { supabaseConfigurado } from '@/lib/supabase/ambiente'

const mensagens: Record<string, string> = {
  credenciais: 'E-mail ou senha incorretos.',
  config: 'O Supabase ainda não está configurado neste ambiente.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const params = await searchParams
  const configurado = supabaseConfigurado()
  const erro = params.erro ? mensagens[params.erro] : null

  return (
    <main className="pagina">
      <section className="cartao">
        <p className="marca">ELEVA</p>
        <h1>Manutenção</h1>
        <p className="subtitulo">Entre com o acesso liberado pela ELEVA.</p>
        {!configurado ? (
          <p className="aviso">{mensagens.config}</p>
        ) : null}
        {erro && configurado ? <p className="aviso">{erro}</p> : null}
        <form action={entrar}>
          <label>
            E-mail
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              disabled={!configurado}
            />
          </label>
          <label>
            Senha
            <input
              id="senha"
              name="senha"
              type="password"
              autoComplete="current-password"
              required
              disabled={!configurado}
            />
          </label>
          <button type="submit" disabled={!configurado}>
            Entrar
          </button>
        </form>
      </section>
    </main>
  )
}
