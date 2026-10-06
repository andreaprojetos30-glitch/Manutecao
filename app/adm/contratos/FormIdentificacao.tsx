'use client'

import { useActionState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import type { EstadoForm } from '@/app/adm/contratos/acoes'

export function FormIdentificacao({
  action,
  contratoId,
  equipamentoId,
  nome,
  identificacao,
  cancelar,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>
  contratoId: string
  equipamentoId: string
  nome: string
  identificacao: string
  cancelar: string
}) {
  const [estado, acao] = useActionState(action, { erro: '' })

  return (
    <form action={acao}>
      <input type="hidden" name="contrato_id" value={contratoId} />
      <input type="hidden" name="id" value={equipamentoId} />
      {estado.erro ? (
        <p className="aviso" role="alert">
          {estado.erro}
        </p>
      ) : null}
      <p className="nota">
        {nome}. A identificação é opcional e o nome continua o da lista de equipamentos.
      </p>
      <div className="grade">
        <label className="largo">
          Identificação
          <input name="identificacao" defaultValue={identificacao} maxLength={80} autoComplete="off" />
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
