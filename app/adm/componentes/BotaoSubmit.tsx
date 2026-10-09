'use client'

import { useFormStatus } from 'react-dom'

export function BotaoSubmit({
  children,
  secundario = false,
  perigo = false,
  pendenteTexto = 'Salvando…',
}: {
  children: React.ReactNode
  secundario?: boolean
  perigo?: boolean
  pendenteTexto?: string
}) {
  const { pending } = useFormStatus()
  const classe = perigo ? 'botao-perigo' : secundario ? 'botao-secundario' : undefined
  return (
    <button className={classe} type="submit" disabled={pending}>
      {pending ? pendenteTexto : children}
    </button>
  )
}
