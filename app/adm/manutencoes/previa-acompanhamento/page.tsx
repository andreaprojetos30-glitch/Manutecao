import { notFound } from 'next/navigation'
import { Painel } from '@/app/adm/componentes/Painel'
import { ListaAcompanhamento } from '@/app/adm/manutencoes/ListaAcompanhamento'
import { PainelAcompanhamento } from '@/app/adm/manutencoes/PainelAcompanhamento'
import { termoBusca } from '@/lib/cadastros'
import { montarListaAcompanhamento, situacaoAcompanhamento } from '@/lib/acompanhamento-comprovante'
import { cenariosPreviaAcompanhamento, previaLocalPermitida } from '@/lib/acompanhamento-previa'
import { clienteAdm } from '@/lib/adm'
import { dataHoraHumana } from '@/lib/manutencoes'

const CAMINHO = '/adm/manutencoes/previa-acompanhamento'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Prévia do acompanhamento · ELEVA Manutenção' }

export default async function PreviaAcompanhamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ acompanhamento?: string; q?: string }>
}) {
  await clienteAdm()
  if (!previaLocalPermitida({
    nodeEnv: process.env.NODE_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  })) {
    notFound()
  }

  const params = await searchParams
  const modo = situacaoAcompanhamento(params.acompanhamento)
  const agora = new Date()
  const lista = montarListaAcompanhamento({
    itens: cenariosPreviaAcompanhamento(agora),
    agora,
    situacao: modo,
    busca: modo ? termoBusca(params.q) : '',
  })
  const permanecer = `${CAMINHO}?acompanhamento=${modo ?? ''}${lista.busca ? `&q=${encodeURIComponent(lista.busca)}` : ''}`

  return (
    <Painel atual="manutencoes" extenso>
      <div className="topo">
        <h1>Prévia dos indicadores</h1>
        <a className="botao botao-secundario" href="/adm/manutencoes">Agenda real</a>
      </div>
      <section className="previa-acompanhamento">
        <p>Registros fictícios, calculados nesta abertura. O acompanhamento operacional continua sem início.</p>
        <p className="nota">
          Referência desta prévia: {dataHoraHumana(agora.toISOString())}. O condomínio “72 horas exatas” teve o primeiro envio exatamente 72 horas antes e permanece em Aguardando confirmação.
        </p>
      </section>
      <PainelAcompanhamento
        ativado
        contagens={lista.contagens}
        atual={modo}
        busca={lista.busca}
        caminho={CAMINHO}
      />
      {modo ? (
        <ListaAcompanhamento
          modo={modo}
          busca={lista.busca}
          linhas={lista.linhas}
          caminho={CAMINHO}
          hrefLinha={() => permanecer}
          hrefContato={() => permanecer}
        />
      ) : (
        <p className="nota">Escolha um indicador para ver a lista fictícia. A busca por condomínio fica disponível dentro de cada indicador.</p>
      )}
    </Painel>
  )
}
