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
    categoria: string
    fabricante: string
    modelo: string
    observacoes: string
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
        <label>
          Nome
          <input name="nome" required defaultValue={inicial.nome} />
        </label>
        <label>
          Categoria
          <input name="categoria" required defaultValue={inicial.categoria} />
        </label>
        <label>
          Fabricante
          <input name="fabricante" defaultValue={inicial.fabricante} />
        </label>
        <label>
          Modelo
          <input name="modelo" defaultValue={inicial.modelo} />
        </label>
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
