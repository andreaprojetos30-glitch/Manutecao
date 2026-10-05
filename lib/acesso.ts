export type Destino = '/adm' | '/prestador' | '/sem-acesso'

export function destinoOperacional(
  perfil: string | null | undefined,
  ativo: boolean,
): Destino {
  if (!ativo) return '/sem-acesso'
  if (perfil === 'admin') return '/adm'
  if (perfil === 'prestador') return '/prestador'
  return '/sem-acesso'
}

export function redirecionar(opts: {
  autenticado: boolean
  perfil: string | null | undefined
  ativo: boolean
  pathname: string
}): string | null {
  const { autenticado, pathname } = opts
  const destino = destinoOperacional(opts.perfil, opts.ativo)

  if (!autenticado) {
    if (pathname === '/login') return null
    return '/login'
  }

  if (pathname === '/login' || pathname === '/') return destino

  if (pathname === '/sem-acesso' || pathname.startsWith('/sem-acesso/')) {
    return destino === '/sem-acesso' ? null : destino
  }

  if (pathname === '/adm' || pathname.startsWith('/adm/')) {
    return destino === '/adm' ? null : destino
  }

  if (pathname === '/prestador' || pathname.startsWith('/prestador/')) {
    return destino === '/prestador' ? null : destino
  }

  return destino
}
