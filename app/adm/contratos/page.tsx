import { Avisos } from '@/app/adm/componentes/Avisos'
import { Lista } from '@/app/adm/componentes/Lista'
import { Painel } from '@/app/adm/componentes/Painel'
import { BuscaContrato } from '@/app/adm/contratos/BuscaContrato'
import { dataHumana } from '@/lib/cadastros'
import { listarContratos } from '@/lib/consultas-contrato'
import { rotuloContrato, rotuloStatusContrato, textoContratos, textoVisitas } from '@/lib/contratos'

export const metadata = { title: 'Contratos · ELEVA Manutenção' }

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; situacao?: string; erro?: string; salvo?: string }>
}) {
  const params = await searchParams
  const lista = await listarContratos(params.q, params.situacao)

  return (
    <Painel atual="contratos">
      <div className="topo">
        <h1>Contratos</h1>
        <a className="botao" href="/adm/contratos/novo">
          Novo contrato
        </a>
      </div>
      <p className="nota">Cada contrato pertence a um condomínio. A manutenção avulsa não entra nesta lista.</p>
      <Avisos erro={params.erro} salvo={params.salvo} />
      {lista.erro ? (
        <p className="aviso" role="alert">
          {lista.erro}
        </p>
      ) : null}
      <BuscaContrato acao="/adm/contratos" q={lista.termo} situacao={lista.situacao} />
      <p className="contador" role="status">
        {textoContratos(lista.linhas.length)}
      </p>
      {lista.limite ? <p className="limite">Há mais resultados. Refine a busca.</p> : null}
      <Lista
        vazio="Nenhum contrato encontrado."
        itens={lista.linhas.map((item) => ({
          chave: item.id,
          href: `/adm/contratos/${item.id}`,
          titulo: rotuloContrato(item.numero_contrato),
          meta: `${item.condominio_nome} · ${textoVisitas(item.quantidade_visitas)} · manutenção ${dataHumana(item.data_inicio_manutencao)}`,
          ativo: item.status === 'ativo',
          selo: rotuloStatusContrato(item.status),
        }))}
      />
    </Painel>
  )
}
