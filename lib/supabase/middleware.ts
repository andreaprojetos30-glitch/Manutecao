import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { redirecionar } from '@/lib/acesso'
import { supabaseConfigurado } from '@/lib/supabase/ambiente'

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (!supabaseConfigurado()) {
    const destino = redirecionar({
      autenticado: false,
      perfil: null,
      ativo: false,
      pathname,
    })
    if (!destino) return NextResponse.next()
    const url = request.nextUrl.clone()
    url.pathname = destino
    url.search = ''
    return NextResponse.redirect(url)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let perfil: string | null = null
  let ativo = false

  if (user) {
    const { data } = await supabase
      .from('usuarios')
      .select('perfil, ativo')
      .eq('id', user.id)
      .maybeSingle()
    perfil = data?.perfil ?? null
    ativo = data?.ativo ?? false
  }

  const destino = redirecionar({
    autenticado: Boolean(user),
    perfil,
    ativo,
    pathname,
  })

  if (!destino) return supabaseResponse

  const url = request.nextUrl.clone()
  url.pathname = destino
  url.search = ''
  const redirectResponse = NextResponse.redirect(url)
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie)
  })
  return redirectResponse
}
