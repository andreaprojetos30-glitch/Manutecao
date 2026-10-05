'use client'

import { useActionState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import type { EstadoForm } from '@/app/adm/contratos/acoes'

type Opcao = { id: string; nome: string }

type Inicial = {
  id?: string
  matrizId: string
  nome: string
  entrada: string
  saida: string
}

export function FormEquipamentoContrato({
  action,
  contratoId,
  inicial,
  equipamentos,
  cancelar,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>
  contratoId: string
  inicial: Inicial
  equipamentos: Opcao[]
  cancelar?: string
}) {
  const [estado, acao] = useActionState(action, { erro: '' })

  return (
    <form action={acao}>
      <input type="hidden" name="contrato_id" value={contratoId} />
      {inicial.id ? <input type="hidden" name="id" value={inicial.id} /> : null}
      {estado.erro ? (
        <p className="aviso" role="alert">
          {estado.erro}
        </p>
      ) : null}
      <div className="grade">
        <label className="largo">
          Equipamento
          <select name="equipamento_matriz_id" defaultValue={inicial.matrizId} required>
            <option value="">Selecione</option>
            {equipamentos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Identificação
          <input name="nome_identificacao" defaultValue={inicial.nome} required placeholder="Esteira 01" />
        </label>
        <label>
          Entrada
          <input name="data_entrada" type="date" defaultValue={inicial.entrada} required />
        </label>
        <label>
          Saída
          <input name="data_saida" type="date" defaultValue={inicial.saida} />
        </label>
        <p className="nota largo">A saída é opcional. O equipamento participa na data de saída e sai nas visitas seguintes.</p>
      </div>
      <div className="acoes">
        <BotaoSubmit>{inicial.id ? 'Salvar equipamento' : 'Adicionar equipamento'}</BotaoSubmit>
        {cancelar ? (
          <a className="botao botao-secundario" href={cancelar}>
            Cancelar
          </a>
        ) : null}
      </div>
    </form>
  )
}
