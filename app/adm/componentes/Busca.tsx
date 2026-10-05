import type { Situacao } from '@/lib/cadastros'

export function Busca({
  acao,
  q,
  situacao,
  placeholder,
}: {
  acao: string
  q: string
  situacao: Situacao
  placeholder: string
}) {
  return (
    <form className="busca" action={acao} method="get">
      <div className="grade">
        <label className="largo">
          Buscar
          <input name="q" defaultValue={q} placeholder={placeholder} />
        </label>
        <label>
          Situação
          <select name="situacao" defaultValue={situacao}>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
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
