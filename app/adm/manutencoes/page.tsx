import { Avisos } from '@/app/adm/componentes/Avisos'
import { Painel } from '@/app/adm/componentes/Painel'
import { BuscaManutencao } from '@/app/adm/manutencoes/BuscaManutencao'
import { ListaAcompanhamento } from '@/app/adm/manutencoes/ListaAcompanhamento'
import { PainelAcompanhamento } from '@/app/adm/manutencoes/PainelAcompanhamento'
import { dataHumana, hojeIso, termoBusca } from '@/lib/cadastros'
import { opcoesPrestador } from '@/lib/consultas-contrato'
import { listarManutencoes } from '@/lib/consultas-manutencao'
import { lerFatosAcompanhamento } from '@/lib/acompanhamento-comprovante-dados'
import {
  montarListaAcompanhamento,
  situacaoAcompanhamento,
} from '@/lib/acompanhamento-comprovante'
import { rotuloManutencao, textoManutencoes, visitaAtrasada } from '@/lib/manutencoes'
import { rotuloStatusVisita } from '@/lib/contratos'

export const metadata = { title: 'Manutenções · ELEVA Manutenção' }

export default async function ManutencoesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; prestador?: string; de?: string; ate?: string; acompanhamento?: string; erro?: string; salvo?: string }>
}) {
  const params = await searchParams
  const modo = situacaoAcompanhamento(params.acompanhamento)
  const leitura = await lerFatosAcompanhamento()
  const acompanhamentoAtivo = leitura.estado === 'ok' && leitura.fatos.ativado
  const agora = new Date()
  const listaAcompanhamento = leitura.estado === 'ok' && leitura.fatos.ativado
    ? montarListaAcompanhamento({
        itens: leitura.fatos.itens,
        agora,
        situacao: modo,
        busca: modo ? termoBusca(params.q) : '',
      })
    : null
  const mostrandoAcompanhamento = Boolean(modo && acompanhamentoAtivo && listaAcompanhamento)
  const [lista, prestadores] = mostrandoAcompanhamento
    ? [null, []] as const
    : await Promise.all([
        listarManutencoes(params),
        opcoesPrestador(listaPrestadorAtual(params.prestador)),
      ])
  const hoje = hojeIso()

  return (
    <Painel atual="manutencoes" extenso>
      <div className="topo">
        <h1>Manutenções</h1>
        <a className="botao" href="/adm/manutencoes/nova">
          Nova manutenção avulsa
        </a>
      </div>
      <p className="nota">Visitas do contrato e manutenções avulsas. Uma data alterada não move as outras.</p>
      <Avisos erro={params.erro} salvo={params.salvo} />
      {leitura.estado === 'indisponivel' ? (
        <p className="nota">O acompanhamento ainda não está disponível neste ambiente.</p>
      ) : (
        <PainelAcompanhamento
          ativado={acompanhamentoAtivo}
          contagens={listaAcompanhamento?.contagens ?? null}
          atual={mostrandoAcompanhamento ? modo : null}
          busca={listaAcompanhamento?.busca ?? ''}
        />
      )}
      {mostrandoAcompanhamento && listaAcompanhamento && modo ? (
        <ListaAcompanhamento modo={modo} busca={listaAcompanhamento.busca} linhas={listaAcompanhamento.linhas} />
      ) : (
        <>
          {lista?.erro ? (
            <p className="aviso" role="alert">
              {lista.erro}
            </p>
          ) : null}
          <BuscaManutencao
            q={lista?.termo ?? ''}
            status={lista?.status ?? 'todos'}
            prestador={lista?.prestador ?? 'todos'}
            inicio={lista?.inicio ?? ''}
            fim={lista?.fim ?? ''}
            prestadores={prestadores.map((item) => ({ id: item.id, nome: item.nome }))}
          />
          <p className="contador" role="status">
            {textoManutencoes(lista?.linhas.length ?? 0)}
          </p>
          {lista?.limite ? <p className="limite">Há mais resultados. Refine a busca.</p> : null}
          {lista && lista.linhas.length === 0 ? <p className="vazio">Nenhuma manutenção encontrada.</p> : null}
          <ul className="lista">
            {lista?.linhas.map((item) => {
              const atrasada = !item.registro_anterior && visitaAtrasada(item.status, item.data_programada_atual, hoje)
              const quando = item.registro_anterior && item.data_realizada
                ? `Realizada em ${dataHumana(item.data_realizada)}`
                : dataHumana(item.data_programada_atual)
              return (
                <li key={item.id}>
                  <a className={atrasada ? 'atrasada' : undefined} href={`/adm/manutencoes/${item.id}`}>
                    <strong>{rotuloManutencao(item.tipo, item.numero_visita, item.quantidade_visitas)}</strong>
                    <span className="meta">
                      {item.condominio_nome} · {quando} · {item.registro_anterior ? 'Registro anterior' : (item.prestador_nome ?? 'Sem prestador')}
                    </span>
                    <span className={atrasada ? 'selo selo-atrasada' : item.status === 'programada' ? 'selo' : 'selo selo-inativo'}>
                      {item.registro_anterior ? 'Registro anterior' : atrasada ? 'Atrasada' : rotuloStatusVisita(item.status)}
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Painel>
  )
}

function listaPrestadorAtual(valor: string | undefined) {
  return valor && /^[0-9a-f-]{36}$/i.test(valor) ? valor : null
}
