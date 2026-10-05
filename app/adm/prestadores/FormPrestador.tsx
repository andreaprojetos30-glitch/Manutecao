'use client'

import { useActionState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import type { EstadoForm } from '@/app/adm/acoes'
import type { OpcaoAcesso } from '@/lib/consultas-cadastro'

export function FormPrestador({
  action,
  inicial,
  acessos,
  cancelar,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>
  inicial: {
    id?: string
    nome: string
    whatsapp: string
    email: string
    usuarioId: string
    observacoes: string
  }
  acessos: OpcaoAcesso[]
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
          Nome
          <input name="nome" required defaultValue={inicial.nome} autoComplete="name" />
        </label>
        <label>
          WhatsApp
          <input name="whatsapp" required defaultValue={inicial.whatsapp} inputMode="tel" autoComplete="tel" />
        </label>
        <label>
          E-mail
          <input name="email" type="email" defaultValue={inicial.email} autoComplete="email" />
        </label>
        <label className="largo">
          Acesso ao sistema
          <select name="usuario_id" defaultValue={inicial.usuarioId}>
            <option value="">Sem acesso ao sistema</option>
            {acessos.map((acesso) => (
              <option key={acesso.valor} value={acesso.valor}>
                {acesso.rotulo}
              </option>
            ))}
          </select>
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
