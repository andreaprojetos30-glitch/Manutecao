'use client'

import { useState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'

export function FormVisitasAnteriores({
  action,
  contratoId,
  total,
  maximo,
  rotulo,
  nota,
}: {
  action: (formData: FormData) => Promise<void>
  contratoId: string
  total: number
  maximo: number
  rotulo: string
  nota: string
}) {
  const [quantidade, setQuantidade] = useState('0')
  const informado = Number(quantidade)
  const anteriores = Number.isInteger(informado) && informado > 0 ? Math.min(informado, maximo) : 0

  return (
    <form action={action}>
      <input type="hidden" name="contrato_id" value={contratoId} />
      <input type="hidden" name="total_visitas" value={String(total)} />
      <input type="hidden" name="maximo_anteriores" value={String(maximo)} />
      <label>
        Manutenções já realizadas antes do sistema
        <input
          name="anteriores"
          type="number"
          min={0}
          max={maximo}
          value={quantidade}
          onChange={(evento) => setQuantidade(evento.target.value)}
        />
      </label>
      <p className="nota">{nota}</p>
      {Array.from({ length: anteriores }, (_, indice) => (
        <label key={indice}>
          Data efetiva da visita {indice + 1}
          <input name={`data_${indice + 1}`} type="date" required />
        </label>
      ))}
      {anteriores > 0 ? (
        <label className="confirma">
          <input name="confirmar" type="checkbox" value="sim" required />
          Confirmo que estas visitas já foram realizadas antes do sistema, sem checklist nem evidência do aplicativo
        </label>
      ) : null}
      <div className="acoes">
        <BotaoSubmit pendenteTexto="Salvando…">{rotulo}</BotaoSubmit>
      </div>
    </form>
  )
}
