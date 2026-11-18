'use client'

import { useFormStatus } from 'react-dom'

export function BotaoSubmit({
  children,
  secundario = false,
  perigo = false,
  pendenteTexto = 'Salvando…',
  ocupado = false,
}: {
  children: React.ReactNode
  secundario?: boolean
  perigo?: boolean
  pendenteTexto?: string
  ocupado?: boolean
}) {
  const { pending } = useFormStatus()
  const classe = perigo ? 'botao-perigo' : secundario ? 'botao-secundario' : undefined
  const aguardando = pending || ocupado
  return (
    <button className={classe} type="submit" disabled={aguardando}>
      {aguardando ? pendenteTexto : children}
    </button>
  )
}
