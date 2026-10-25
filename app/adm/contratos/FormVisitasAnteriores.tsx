'use client'

import { useState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { textoProximaVisita } from '@/lib/contratos'

export function FormVisitasAnteriores({
  action,
  contratoId,
  total,
  maximo,
  rotulo,
  nota,
  confirmacao,
  gerada = false,
}: {
  action: (formData: FormData) => Promise<void>
  contratoId: string
  total: number
  maximo: number
  rotulo: string
  nota: string
  confirmacao: string
  gerada?: boolean
}) {
  const [quantidade, setQuantidade] = useState('0')
  const informado = Number(quantidade)
  const inteira = Number.isInteger(informado) && informado >= 0 ? informado : null
  const explicacao =
    inteira === null
      ? 'Informe a quantidade de visitas anteriores.'
      : inteira > total
        ? 'A quantidade de visitas anteriores passa do total do contrato.'
        : inteira >= total
          ? textoProximaVisita(inteira, total, gerada)
          : inteira > maximo
            ? 'Não é possível alterar visita já iniciada.'
            : textoProximaVisita(inteira, total, gerada)
  const pedeConfirmacao = inteira !== null && inteira > 0 && inteira <= maximo && inteira < total

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
      <p className="nota">{explicacao}</p>
      {pedeConfirmacao ? (
        <label className="confirma">
          <input name="confirmar" type="checkbox" value="sim" required />
          {confirmacao}
        </label>
      ) : null}
      <div className="acoes">
        <BotaoSubmit pendenteTexto="Salvando…">{rotulo}</BotaoSubmit>
      </div>
    </form>
  )
}
