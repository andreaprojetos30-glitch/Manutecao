'use client'

import { useMemo, useState } from 'react'
import { useActionState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import type { EstadoForm } from '@/app/adm/manutencoes/acoes'

type Opcao = { id: string; nome: string }

function combina(termo: string, nome: string) {
  const alvo = termo.trim().toLocaleLowerCase('pt-BR')
  if (!alvo) return true
  return nome.toLocaleLowerCase('pt-BR').includes(alvo)
}

export function FormAvulsa({
  action,
  condominios,
  prestadores,
  equipamentos,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>
  condominios: Opcao[]
  prestadores: Opcao[]
  equipamentos: Opcao[]
}) {
  const [estado, acao] = useActionState(action, { erro: '' })
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState<string[]>([])
  const visiveis = useMemo(() => equipamentos.filter((item) => combina(busca, item.nome)), [busca, equipamentos])

  function alternar(id: string, marcado: boolean) {
    setMarcados((atual) => (marcado ? [...atual.filter((item) => item !== id), id] : atual.filter((item) => item !== id)))
  }

  return (
    <form action={acao}>
      {estado.erro ? (
        <p className="aviso" role="alert">
          {estado.erro}
        </p>
      ) : null}
      <div className="grade">
        <label>
          Condomínio
          <select name="condominio_id" required defaultValue="">
            <option value="">Selecione</option>
            {condominios.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data
          <input name="data" type="date" required />
        </label>
        <label className="largo">
          Prestador
          <select name="prestador_id" required defaultValue="">
            <option value="">Selecione</option>
            {prestadores.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      <h2>Equipamentos</h2>
      <p className="nota">Marque os equipamentos desta execução. O nome vem da lista-base. Não há numeração de visita.</p>
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
            </li>
          )
        })}
      </ul>
      <div className="acoes">
        <BotaoSubmit pendenteTexto="Criando…">Criar manutenção avulsa</BotaoSubmit>
        <a className="botao botao-secundario" href="/adm/manutencoes">
          Cancelar
        </a>
      </div>
    </form>
  )
}
