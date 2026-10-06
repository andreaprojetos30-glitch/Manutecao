'use client'

import { useMemo, useState } from 'react'
import { useActionState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { textoSelecionados } from '@/lib/contratos'
import type { EstadoForm } from '@/app/adm/contratos/acoes'

type Opcao = { id: string; nome: string }

function combina(termo: string, nome: string) {
  const alvo = termo.trim().toLocaleLowerCase('pt-BR')
  if (!alvo) return true
  return nome.toLocaleLowerCase('pt-BR').includes(alvo)
}

export function SelecaoEquipamentos({
  action,
  contratoId,
  equipamentos,
  cancelar,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>
  contratoId: string
  equipamentos: Opcao[]
  cancelar: string
}) {
  const [estado, acao] = useActionState(action, { erro: '' })
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState<string[]>([])
  const [quantidades, setQuantidades] = useState<Record<string, string>>({})
  const visiveis = useMemo(() => equipamentos.filter((item) => combina(busca, item.nome)), [busca, equipamentos])
  const unidades = marcados.reduce((total, id) => {
    const valor = Number(quantidades[id] ?? '1')
    return total + (Number.isInteger(valor) && valor > 0 ? valor : 0)
  }, 0)

  function alternar(id: string, marcado: boolean) {
    setMarcados((atual) => (marcado ? [...atual.filter((item) => item !== id), id] : atual.filter((item) => item !== id)))
    setQuantidades((atual) => (atual[id] ? atual : { ...atual, [id]: '1' }))
  }

  return (
    <form action={acao}>
      <input type="hidden" name="contrato_id" value={contratoId} />
      {estado.erro ? (
        <p className="aviso" role="alert">
          {estado.erro}
        </p>
      ) : null}
      <label className="largo">
        Buscar
        <input
          value={busca}
          placeholder="Nome do equipamento"
          autoComplete="off"
          onChange={(evento) => setBusca(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') evento.preventDefault()
          }}
        />
      </label>
      <p className="contador" role="status">
        {textoSelecionados(unidades)}
      </p>
      {visiveis.length === 0 ? <p className="vazio">Nenhum equipamento encontrado.</p> : null}
      <ul className="selecao">
        {equipamentos.map((item) => {
          const marcado = marcados.includes(item.id)
          const visivel = visiveis.some((opcao) => opcao.id === item.id)
          if (!visivel) {
            if (!marcado) return null
            return (
              <li key={item.id} hidden>
                <input type="hidden" name="matriz_id" value={item.id} />
                <input type="hidden" name={`quantidade_${item.id}`} value={quantidades[item.id] ?? '1'} />
              </li>
            )
          }
          return (
            <li key={item.id} className={marcado ? 'marcado' : undefined}>
              <label className="escolha">
                <input
                  type="checkbox"
                  name="matriz_id"
                  value={item.id}
                  checked={marcado}
                  onChange={(evento) => alternar(item.id, evento.target.checked)}
                />
                <strong>{item.nome}</strong>
              </label>
              {marcado ? (
                <label className="quantidade">
                  Quantidade
                  <input
                    type="number"
                    name={`quantidade_${item.id}`}
                    min={1}
                    max={99}
                    inputMode="numeric"
                    value={quantidades[item.id] ?? '1'}
                    onChange={(evento) => setQuantidades((atual) => ({ ...atual, [item.id]: evento.target.value }))}
                  />
                </label>
              ) : null}
            </li>
          )
        })}
      </ul>
      <div className="acoes">
        <BotaoSubmit pendenteTexto="Adicionando…">Adicionar selecionados</BotaoSubmit>
        <a className="botao botao-secundario" href={cancelar}>
          Cancelar
        </a>
      </div>
    </form>
  )
}
