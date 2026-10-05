import { Avisos } from '@/app/adm/componentes/Avisos'
import { Busca } from '@/app/adm/componentes/Busca'
import { Lista } from '@/app/adm/componentes/Lista'
import { Painel } from '@/app/adm/componentes/Painel'
import { listarCondominios } from '@/lib/consultas-cadastro'

export const metadata = { title: 'Condomínios · ELEVA Manutenção' }

export default async function CondominiosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; situacao?: string; erro?: string; salvo?: string }>
}) {
  const params = await searchParams
  const lista = await listarCondominios(params.q, params.situacao)

  return (
    <Painel atual="condominios">
      <div className="topo">
        <h1>Condomínios</h1>
        <a className="botao" href="/adm/condominios/novo">
          Novo condomínio
        </a>
      </div>
      <Avisos erro={params.erro} salvo={params.salvo} />
      {lista.erro ? (
        <p className="aviso" role="alert">
          {lista.erro}
        </p>
      ) : null}
      <Busca acao="/adm/condominios" q={lista.termo} situacao={lista.situacao} placeholder="Nome, cidade ou bairro" />
      {lista.limite ? <p className="limite">Há mais resultados. Refine a busca.</p> : null}
      <Lista
        vazio="Nenhum condomínio encontrado."
        itens={lista.linhas.map((item) => ({
          chave: item.id,
          href: `/adm/condominios/${item.id}`,
          titulo: item.nome,
          meta: `${item.bairro} · ${item.cidade}/${item.estado}`,
          ativo: item.ativo,
        }))}
      />
    </Painel>
  )
}
