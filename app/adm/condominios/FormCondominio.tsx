'use client'

import { useActionState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { ESTADOS } from '@/lib/cadastros'
import type { EstadoForm } from '@/app/adm/acoes'

type Inicial = {
  id?: string
  nome: string
  cep: string
  endereco: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  estado: string
  quantidadeUnidades: string
  observacoes: string
}

export function FormCondominio({
  action,
  inicial,
  cancelar,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>
  inicial: Inicial
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
          <input name="nome" defaultValue={inicial.nome} required autoComplete="organization" />
        </label>
        <label>
          CEP
          <input name="cep" defaultValue={inicial.cep} inputMode="numeric" autoComplete="postal-code" />
        </label>
        <label>
          Número
          <input name="numero" defaultValue={inicial.numero} />
        </label>
        <label className="largo">
          Endereço
          <input name="endereco" defaultValue={inicial.endereco} required autoComplete="street-address" />
        </label>
        <label className="largo">
          Complemento
          <input name="complemento" defaultValue={inicial.complemento} />
        </label>
        <label>
          Bairro
          <input name="bairro" defaultValue={inicial.bairro} required />
        </label>
        <label>
          Cidade
          <input name="cidade" defaultValue={inicial.cidade} required autoComplete="address-level2" />
        </label>
        <label>
          Estado
          <select name="estado" defaultValue={inicial.estado} required>
            <option value="">Selecione</option>
            {ESTADOS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantidade de unidades
          <input name="quantidade_unidades" defaultValue={inicial.quantidadeUnidades} inputMode="numeric" />
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
