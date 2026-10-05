'use client'

import { useActionState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import type { EstadoForm } from '@/app/adm/acoes'

export function FormSindicoNovo({
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
        <label className="largo">
          Nome
          <input name="nome" required autoComplete="name" />
        </label>
        <label>
          WhatsApp
          <input name="whatsapp" inputMode="tel" autoComplete="tel" />
        </label>
        <label>
          E-mail
          <input name="email" type="email" autoComplete="email" />
        </label>
        <label>
          Data de início
          <input name="data_inicio" type="date" required defaultValue={dataInicio} />
        </label>
      </div>
      <div className="acoes">
        <BotaoSubmit>Registrar síndico</BotaoSubmit>
      </div>
    </form>
  )
}

export function FormSindicoCorrecao({
  action,
  inicial,
  cancelar,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>
  inicial: {
    id: string
    condominioId: string
    nome: string
    whatsapp: string
    email: string
    dataInicio: string
    dataFim: string
    ativo: boolean
    periodo: string
  }
  cancelar: string
}) {
  const [estado, acao] = useActionState(action, { erro: '' })

  return (
    <form action={acao}>
      <input type="hidden" name="id" value={inicial.id} />
      <input type="hidden" name="condominio_id" value={inicial.condominioId} />
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
          <input name="whatsapp" defaultValue={inicial.whatsapp} inputMode="tel" autoComplete="tel" />
        </label>
        <label>
          E-mail
          <input name="email" type="email" defaultValue={inicial.email} autoComplete="email" />
        </label>
        {inicial.ativo ? (
          <label>
            Data de início
            <input name="data_inicio" type="date" required defaultValue={inicial.dataInicio} />
          </label>
        ) : (
          <p className="nota largo">
            Período encerrado: {inicial.periodo}. Para voltar, registre um novo síndico no condomínio. Este
            registro permanece no histórico.
          </p>
        )}
      </div>
      <div className="acoes">
        <BotaoSubmit>Salvar correção</BotaoSubmit>
        <a className="botao botao-secundario" href={cancelar}>
          Cancelar
        </a>
      </div>
    </form>
  )
}
