import type { FiltroPrestador, FiltroStatusVisita } from '@/lib/manutencoes'

type Prestador = { id: string; nome: string }

export function BuscaManutencao({
  q,
  status,
  prestador,
  inicio,
  fim,
  prestadores,
}: {
  q: string
  status: FiltroStatusVisita
  prestador: FiltroPrestador
  inicio: string
  fim: string
  prestadores: Prestador[]
}) {
  return (
    <form className="busca" action="/adm/manutencoes" method="get">
      <div className="grade">
        <label className="largo">
          Buscar
          <input name="q" defaultValue={q} placeholder="Condomínio" />
        </label>
        <label>
          Status
          <select name="status" defaultValue={status}>
            <option value="todos">Todos</option>
            <option value="programada">Programada</option>
            <option value="em_execucao">Em execução</option>
            <option value="aguardando_administracao">Aguardando administração</option>
            <option value="realizada">Realizada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </label>
        <label>
          Prestador
          <select name="prestador" defaultValue={prestador}>
            <option value="todos">Todos</option>
            <option value="sem">Sem prestador</option>
            {prestadores.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          De
          <input name="de" type="date" defaultValue={inicio} />
        </label>
        <label>
          Até
          <input name="ate" type="date" defaultValue={fim} />
        </label>
      </div>
      <div className="acoes">
        <button type="submit">Buscar</button>
        <a className="botao botao-secundario" href="/adm/manutencoes">
          Limpar
        </a>
      </div>
    </form>
  )
}
