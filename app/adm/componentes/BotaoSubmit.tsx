'use client'

import { useFormStatus } from 'react-dom'

export function BotaoSubmit({
  children,
  secundario = false,
  pendenteTexto = 'Salvando…',
}: {
  children: React.ReactNode
  secundario?: boolean
  pendenteTexto?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button className={secundario ? 'botao-secundario' : undefined} type="submit" disabled={pending}>
      {pending ? pendenteTexto : children}
    </button>
  )
}
