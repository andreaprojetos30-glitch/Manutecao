'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { sugerirIdentificacao } from '@/lib/contratos'
import type { EstadoForm } from '@/app/adm/contratos/acoes'

type Opcao = { id: string; nome: string }

type Contagem = { matrizId: string; quantidade: number }

type Inicial = {
  id?: string
  matrizId: string
  nome: string
}

export function FormEquipamentoContrato({
  action,
  contratoId,
  inicial,
  equipamentos,
  contagens,
  cancelar,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>
  contratoId: string
  inicial: Inicial
  equipamentos: Opcao[]
  contagens: Contagem[]
  cancelar?: string
}) {
  const [estado, acao] = useActionState(action, { erro: '' })
  const [matrizId, setMatrizId] = useState(inicial.matrizId)
  const [nome, setNome] = useState(inicial.nome)

  function escolher(id: string) {
    setMatrizId(id)
    if (inicial.id && id === inicial.matrizId) {
      setNome(inicial.nome)
      return
    }
    const opcao = equipamentos.find((item) => item.id === id)
    const quantidade = contagens.find((item) => item.matrizId === id)?.quantidade ?? 0
    setNome(opcao ? sugerirIdentificacao(opcao.nome, quantidade) : '')
  }

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
          <select name="equipamento_matriz_id" value={matrizId} required onChange={(evento) => escolher(evento.target.value)}>
            <option value="">Selecione</option>
            {equipamentos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="largo">
          Identificação do equipamento
          <input name="nome_identificacao" value={nome} required onChange={(evento) => setNome(evento.target.value)} />
        </label>
      </div>
      <div className="acoes">
        <BotaoSubmit>{inicial.id ? 'Salvar' : 'Adicionar equipamento'}</BotaoSubmit>
        {cancelar ? (
          <a className="botao botao-secundario" href={cancelar}>
            Cancelar
          </a>
        ) : null}
      </div>
    </form>
  )
}
