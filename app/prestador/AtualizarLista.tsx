'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useTransition } from 'react'

export function AtualizarLista() {
  const router = useRouter()
  const [atualizando, iniciar] = useTransition()
  const ultimo = useRef(0)

  function atualizar() {
    ultimo.current = Date.now()
    iniciar(() => {
      router.refresh()
    })
  }

  useEffect(() => {
    function aoVoltar() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - ultimo.current < 1000) return
      atualizar()
    }

    function aoReabrir(evento: PageTransitionEvent) {
      if (!evento.persisted) return
      if (Date.now() - ultimo.current < 1000) return
      atualizar()
    }

    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('pageshow', aoReabrir)
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('pageshow', aoReabrir)
    }
  }, [router])

  return (
    <div className="acoes">
      <button type="button" className="botao botao-secundario" onClick={atualizar} disabled={atualizando}>
        {atualizando ? 'Atualizando…' : 'Atualizar'}
      </button>
    </div>
  )
}
