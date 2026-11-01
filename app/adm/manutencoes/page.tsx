import { Avisos } from '@/app/adm/componentes/Avisos'
import { Painel } from '@/app/adm/componentes/Painel'
import { BuscaManutencao } from '@/app/adm/manutencoes/BuscaManutencao'
import { PainelAcompanhamento } from '@/app/adm/manutencoes/PainelAcompanhamento'
import { dataHumana, hojeIso, termoBusca } from '@/lib/cadastros'
import { opcoesPrestador } from '@/lib/consultas-contrato'
import { listarManutencoes } from '@/lib/consultas-manutencao'
import { lerFatosAcompanhamento } from '@/lib/acompanhamento-comprovante-dados'
import {
  mensagemListaAcompanhamento,
  montarListaAcompanhamento,
  rotuloSituacao,
  situacaoAcompanhamento,
  textoAlertaWhatsapp,
  textoDiasAguardando,
} from '@/lib/acompanhamento-comprovante'
import { dataHoraHumana, rotuloManutencao, textoManutencoes, visitaAtrasada } from '@/lib/manutencoes'
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
        <AcompanhamentoLista modo={modo} busca={listaAcompanhamento.busca} linhas={listaAcompanhamento.linhas} />
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

function AcompanhamentoLista({
  modo,
  busca,
  linhas,
}: {
  modo: NonNullable<ReturnType<typeof situacaoAcompanhamento>>
  busca: string
  linhas: ReturnType<typeof montarListaAcompanhamento>['linhas']
}) {
  const vazia = mensagemListaAcompanhamento(modo, busca, linhas.length)
  return (
    <>
      <form className="busca" action="/adm/manutencoes" method="get">
        <input type="hidden" name="acompanhamento" value={modo} />
        <div className="grade">
          <label className="largo">
            Buscar condomínio
            <input name="q" defaultValue={busca} placeholder="Condomínio" />
          </label>
        </div>
        <div className="acoes">
          <button type="submit">Buscar</button>
          <a className="botao botao-secundario" href="/adm/manutencoes">
            Voltar à agenda
          </a>
        </div>
      </form>
      <p className="contador" role="status">
        {rotuloSituacao(modo)} · {linhas.length === 1 ? '1 manutenção' : `${linhas.length} manutenções`}
      </p>
      {vazia ? <p className="vazio">{vazia}</p> : null}
      <ul className="lista lista-acompanhamento">
        {linhas.map((linha) => (
          <li key={linha.manutencaoId}>
            <a className={linha.situacao === 'mais_de_3_dias' ? 'atrasada' : undefined} href={`/adm/manutencoes/${linha.manutencaoId}`}>
              <strong>{linha.condominioNome}</strong>
              <span className="meta">Manutenção em {dataHumana(linha.dataManutencao)}</span>
              {linha.dias !== null ? <span className="meta">Aguardando confirmação {textoDiasAguardando(linha.dias)}</span> : null}
              {linha.primeiroEnvioEm ? <span className="meta">Primeiro envio em {dataHoraHumana(linha.primeiroEnvioEm)}</span> : null}
              {linha.ultimoLembreteEm ? <span className="meta">Último lembrete em {dataHoraHumana(linha.ultimoLembreteEm)}</span> : null}
              {linha.dias !== null && !linha.ultimoLembreteEm ? <span className="meta">Nenhum lembrete registrado</span> : null}
              {linha.situacao === 'mais_de_3_dias' ? <span className="selo selo-atrasada">Mais de 3 dias</span> : null}
            </a>
            {linha.alertaWhatsapp ? (
              <p className="aviso">
                {textoAlertaWhatsapp(Boolean(linha.primeiroEnvioEm))}{' '}
                <a href={`/adm/condominios/${linha.condominioId}`}>Atualizar contato</a>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  )
}

function listaPrestadorAtual(valor: string | undefined) {
  return valor && /^[0-9a-f-]{36}$/i.test(valor) ? valor : null
}
