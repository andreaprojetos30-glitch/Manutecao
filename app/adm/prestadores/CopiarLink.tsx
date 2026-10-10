'use client'

import { useState } from 'react'

export function CopiarLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false)

  return (
    <button
      className="botao-secundario"
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url)
          setCopiado(true)
        } catch {
          setCopiado(false)
        }
      }}
    >
      {copiado ? 'Link copiado' : 'Copiar link'}
    </button>
  )
}
