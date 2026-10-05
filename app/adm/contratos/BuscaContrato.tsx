import type { SituacaoContrato } from '@/lib/contratos'

export function BuscaContrato({
  acao,
  q,
  situacao,
}: {
  acao: string
  q: string
  situacao: SituacaoContrato
}) {
  return (
    <form className="busca" action={acao} method="get">
      <div className="grade">
        <label className="largo">
          Buscar
          <input name="q" defaultValue={q} placeholder="Número ou condomínio" />
        </label>
        <label>
          Situação
          <select name="situacao" defaultValue={situacao}>
            <option value="ativos">Ativos</option>
            <option value="encerrados">Encerrados</option>
            <option value="cancelados">Cancelados</option>
            <option value="todos">Todos</option>
          </select>
        </label>
      </div>
      <div className="acoes">
        <button type="submit">Buscar</button>
        <a className="botao botao-secundario" href={acao}>
          Limpar
        </a>
      </div>
    </form>
  )
}
