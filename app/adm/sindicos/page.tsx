import { Avisos } from '@/app/adm/componentes/Avisos'
import { Busca } from '@/app/adm/componentes/Busca'
import { Lista } from '@/app/adm/componentes/Lista'
import { Painel } from '@/app/adm/componentes/Painel'
import { periodoSindico } from '@/lib/cadastros'
import { listarSindicos } from '@/lib/consultas-cadastro'

export const metadata = { title: 'Síndicos · ELEVA Manutenção' }

export default async function SindicosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; situacao?: string; erro?: string; salvo?: string }>
}) {
  const params = await searchParams
  const lista = await listarSindicos(params.q, params.situacao)

  return (
    <Painel atual="sindicos">
      <h1>Síndicos</h1>
      <p className="nota">A troca não apaga o síndico anterior. O histórico fica no condomínio.</p>
      <Avisos erro={params.erro} salvo={params.salvo} />
      {lista.erro ? (
        <p className="aviso" role="alert">
          {lista.erro}
        </p>
      ) : null}
      <Busca acao="/adm/sindicos" q={lista.termo} situacao={lista.situacao} placeholder="Nome do síndico ou do condomínio" />
      {lista.limite ? <p className="limite">Há mais resultados. Refine a busca.</p> : null}
      <Lista
        vazio="Nenhum síndico encontrado."
        itens={lista.linhas.map((item) => ({
          chave: item.id,
          href: `/adm/condominios/${item.condominio_id}#sindicos`,
          titulo: item.nome,
          meta: `${item.condominio_nome} · ${periodoSindico(item.data_inicio, item.data_fim, item.ativo)}`,
          ativo: item.ativo,
          selo: item.ativo ? 'Ativo' : 'Histórico',
        }))}
      />
    </Painel>
  )
}
