import { Avisos } from '@/app/adm/componentes/Avisos'
import { Busca } from '@/app/adm/componentes/Busca'
import { Lista } from '@/app/adm/componentes/Lista'
import { Painel } from '@/app/adm/componentes/Painel'
import { listarPrestadores } from '@/lib/consultas-cadastro'

export const metadata = { title: 'Prestadores · ELEVA Manutenção' }

export default async function PrestadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; situacao?: string; erro?: string; salvo?: string }>
}) {
  const params = await searchParams
  const lista = await listarPrestadores(params.q, params.situacao)

  return (
    <Painel atual="prestadores">
      <div className="topo">
        <h1>Prestadores</h1>
        <a className="botao" href="/adm/prestadores/novo">
          Novo prestador
        </a>
      </div>
      <Avisos erro={params.erro} salvo={params.salvo} />
      {lista.erro ? (
        <p className="aviso" role="alert">
          {lista.erro}
        </p>
      ) : null}
      <Busca acao="/adm/prestadores" q={lista.termo} situacao={lista.situacao} placeholder="Nome ou WhatsApp" />
      {lista.limite ? <p className="limite">Há mais resultados. Refine a busca.</p> : null}
      <Lista
        vazio="Nenhum prestador encontrado."
        itens={lista.linhas.map((item) => ({
          chave: item.id,
          href: `/adm/prestadores/${item.id}`,
          titulo: item.nome,
          meta: item.usuario_id ? `${item.whatsapp} · Com acesso ao aplicativo` : `${item.whatsapp} · Sem acesso ao aplicativo`,
          ativo: item.ativo,
        }))}
      />
    </Painel>
  )
}
