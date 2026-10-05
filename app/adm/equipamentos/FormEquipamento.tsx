'use client'

import { useActionState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import type { EstadoForm } from '@/app/adm/acoes'

export function FormEquipamento({
  action,
  inicial,
  cancelar,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>
  inicial: {
    id?: string
    nome: string
  }
  cancelar: string
}) {
  const [estado, acao] = useActionState(action, { erro: '' })

  return (
    <form action={acao}>
      {inicial.id ? <input type="hidden" name="id" value={inicial.id} /> : null}
      {estado.erro ? (
        <p className="aviso" role="alert">
          {estado.erro}
        </p>
      ) : null}
      <div className="grade">
        <label className="largo">
          Nome do equipamento
          <input name="nome" required defaultValue={inicial.nome} />
        </label>
      </div>
      <div className="acoes">
        <BotaoSubmit>Salvar</BotaoSubmit>
        <a className="botao botao-secundario" href={cancelar}>
          Cancelar
        </a>
      </div>
    </form>
  )
}
