'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import type { EstadoForm } from '@/app/adm/acoes'

export function FormPrestador({
  action,
  inicial,
  cancelar,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>
  inicial: {
    id?: string
    nome: string
    whatsapp: string
    email: string
    acesso: 'sim' | 'nao'
    observacoes: string
  }
  cancelar: string
}) {
  const [estado, acao] = useActionState(action, { erro: '' })
  const [acesso, setAcesso] = useState<'sim' | 'nao'>(inicial.acesso)

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
          Nome
          <input name="nome" required defaultValue={inicial.nome} autoComplete="name" />
        </label>
        <label>
          WhatsApp
          <input name="whatsapp" required defaultValue={inicial.whatsapp} inputMode="tel" autoComplete="tel" />
        </label>
        <label>
          E-mail
          <input name="email" type="email" required={acesso === 'sim'} defaultValue={inicial.email} autoComplete="email" />
        </label>
        <fieldset className="escolha largo">
          <legend>Acesso ao aplicativo</legend>
          <label>
            <input type="radio" name="acesso" value="nao" checked={acesso === 'nao'} onChange={() => setAcesso('nao')} />
            Não
          </label>
          <label>
            <input type="radio" name="acesso" value="sim" checked={acesso === 'sim'} onChange={() => setAcesso('sim')} />
            Sim
          </label>
        </fieldset>
        {acesso === 'sim' ? (
          <p className="nota largo">
            {inicial.acesso === 'sim'
              ? 'O prestador continua com este e-mail. Salvar não muda o PIN nem gera outro link.'
              : 'Ao salvar, aparece um link para enviar no WhatsApp. No celular, o prestador ativa o acesso e escolhe um PIN de 3 números. A ELEVA não vê esse PIN.'}
          </p>
        ) : (
          <p className="nota largo">O prestador fica cadastrado e não entra no aplicativo.</p>
        )}
        <label className="largo">
          Observações
          <textarea name="observacoes" defaultValue={inicial.observacoes} />
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
