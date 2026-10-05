import { alternarEquipamento } from '@/app/adm/acoes'
import { Avisos } from '@/app/adm/componentes/Avisos'
import { Busca } from '@/app/adm/componentes/Busca'
import { Painel } from '@/app/adm/componentes/Painel'
import { caminhoMatriz, LOTE_MATRIZ, textoEquipamentos } from '@/lib/cadastros'
import { listarEquipamentos } from '@/lib/consultas-cadastro'

export const metadata = { title: 'Equipamentos · ELEVA Manutenção' }

export default async function EquipamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; situacao?: string; limite?: string; erro?: string; salvo?: string }>
}) {
  const params = await searchParams
  const lista = await listarEquipamentos(params.q, params.situacao, params.limite)
  const proximo = caminhoMatriz({
    q: lista.termo,
    situacao: lista.situacao,
    limite: lista.limite + LOTE_MATRIZ,
  })

  return (
    <Painel atual="equipamentos" extenso>
      <div className="topo">
        <h1>Equipamentos</h1>
        <a className="botao" href="/adm/equipamentos/novo">
          Novo equipamento
        </a>
      </div>
      <p className="nota">Lista-base da ELEVA. Só o nome de cada equipamento.</p>
      <Avisos erro={params.erro} salvo={params.salvo} />
      {lista.erro ? (
        <p className="aviso" role="alert">
          {lista.erro}
        </p>
      ) : null}
      <Busca acao="/adm/equipamentos" q={lista.termo} situacao={lista.situacao} placeholder="Nome do equipamento" />
      <p className="contador" role="status">
        {textoEquipamentos(lista.total)}
      </p>
      {lista.linhas.length === 0 ? (
        <p className="vazio">Nenhum equipamento encontrado.</p>
      ) : (
        <ul className="matriz">
          {lista.linhas.map((item) => (
            <li key={item.id}>
              <div className="matriz-nome">
                <strong>{item.nome}</strong>
                <span className={item.ativo ? 'selo' : 'selo selo-inativo'}>{item.ativo ? 'Ativo' : 'Inativo'}</span>
              </div>
              <div className="comandos">
                <a className="botao botao-secundario" href={`/adm/equipamentos/${item.id}`}>
                  Editar
                </a>
                <form action={alternarEquipamento}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="ativo" value={item.ativo ? 'false' : 'true'} />
                  <input type="hidden" name="origem" value="lista" />
                  <input type="hidden" name="q" value={lista.termo} />
                  <input type="hidden" name="situacao" value={lista.situacao} />
                  <input type="hidden" name="limite" value={String(lista.limite)} />
                  <button className="botao-secundario" type="submit">
                    {item.ativo ? 'Inativar' : 'Reativar'}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {lista.temMais ? (
        <div className="acoes">
          <a className="botao botao-secundario" href={proximo}>
            Carregar mais
          </a>
        </div>
      ) : null}
    </Painel>
  )
}
