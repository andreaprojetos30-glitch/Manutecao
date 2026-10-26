'use client'

import { useActionState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import type { EstadoForm } from '@/app/adm/acoes'

export function FormDestinatario({
  action,
  condominioId,
  dataInicio,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>
  condominioId: string
  dataInicio: string
}) {
  const [estado, acao] = useActionState(action, { erro: '' })

  return (
    <form action={acao}>
      <input type="hidden" name="condominio_id" value={condominioId} />
      {estado.erro ? (
        <p className="aviso" role="alert">
          {estado.erro}
        </p>
      ) : null}
      <div className="grade">
        <label>
          Papel
          <select name="papel" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            <option value="gerente">Gerente</option>
            <option value="conselheiro">Conselheiro</option>
            <option value="administradora">Representante da administradora</option>
            <option value="outro">Outro</option>
          </select>
        </label>
        <label className="largo">
          Nome
          <input name="nome" required autoComplete="name" />
        </label>
        <label>
          WhatsApp
          <input name="whatsapp" required inputMode="tel" autoComplete="tel" />
        </label>
        <label>
          E-mail
          <input name="email" type="email" autoComplete="email" />
        </label>
        <label>
          Data de início
          <input name="data_inicio" type="date" required defaultValue={dataInicio} />
        </label>
        <label className="largo">
          Qual responsável
          <input name="complemento" autoComplete="off" />
        </label>
      </div>
      <p className="nota">O campo “Qual responsável” é obrigatório quando o papel for outro.</p>
      <div className="acoes">
        <BotaoSubmit>Indicar responsável</BotaoSubmit>
      </div>
    </form>
  )
}
