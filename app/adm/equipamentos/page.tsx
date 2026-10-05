import { Avisos } from '@/app/adm/componentes/Avisos'
import { Busca } from '@/app/adm/componentes/Busca'
import { Lista } from '@/app/adm/componentes/Lista'
import { Painel } from '@/app/adm/componentes/Painel'
import { listarEquipamentos } from '@/lib/consultas-cadastro'

export const metadata = { title: 'Equipamentos · ELEVA Manutenção' }

export default async function EquipamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; situacao?: string; erro?: string; salvo?: string }>
}) {
  const params = await searchParams
  const lista = await listarEquipamentos(params.q, params.situacao)

  return (
    <Painel atual="equipamentos">
      <div className="topo">
        <h1>Equipamentos</h1>
        <a className="botao" href="/adm/equipamentos/novo">
          Novo equipamento
        </a>
      </div>
      <p className="nota">Lista-base da ELEVA, só com o nome. Ex.: Esteira, Bike Spinning, Bike Horizontal. Dados de um equipamento dentro do condomínio não entram aqui.</p>
      <Avisos erro={params.erro} salvo={params.salvo} />
      {lista.erro ? (
        <p className="aviso" role="alert">
          {lista.erro}
        </p>
      ) : null}
      <Busca
        acao="/adm/equipamentos"
        q={lista.termo}
        situacao={lista.situacao}
        placeholder="Nome do equipamento"
      />
      {lista.limite ? <p className="limite">Há mais resultados. Refine a busca.</p> : null}
      <Lista
        vazio="Nenhum equipamento encontrado."
        itens={lista.linhas.map((item) => ({
          chave: item.id,
          href: `/adm/equipamentos/${item.id}`,
          titulo: item.nome,
          meta: '',
          ativo: item.ativo,
        }))}
      />
    </Painel>
  )
}
