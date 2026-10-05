import { Avisos } from '@/app/adm/componentes/Avisos'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Painel } from '@/app/adm/componentes/Painel'
import { gerarProgramacao } from '@/app/adm/contratos/acoes'
import { ContratoNaoEncontrado, Orientacao, Passos } from '@/app/adm/contratos/Passos'
import { dataHumana } from '@/lib/cadastros'
import { equipamentosDoContrato, lerContrato, visitasDoContrato } from '@/lib/consultas-contrato'
import {
  orientacaoContrato,
  periodoEquipamento,
  preverProgramacao,
  rotuloContrato,
  rotuloStatusContrato,
  rotuloStatusVisita,
  rotuloVisita,
  textoAlertaAgenda,
  textoVisitas,
} from '@/lib/contratos'

export const metadata = { title: 'Conferir contrato · ELEVA Manutenção' }

export default async function ConferirContratoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string; salvo?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const contrato = await lerContrato(id)
  if (!contrato) return <ContratoNaoEncontrado />

  const [equipamentos, visitas] = await Promise.all([equipamentosDoContrato(contrato.id), visitasDoContrato(contrato.id)])
  const gerada = contrato.programacao_gerada
  const guia = orientacaoContrato(gerada ? 'programacao' : 'conferir', equipamentos.linhas.length, gerada)
  const alerta = textoAlertaAgenda(contrato.data_inicio_manutencao.slice(0, 10), String(contrato.quantidade_visitas), contrato.data_fim_contrato?.slice(0, 10) ?? '')
  const previsao = preverProgramacao(
    contrato.data_inicio_manutencao.slice(0, 10),
    contrato.quantidade_visitas,
    equipamentos.linhas.map((item) => ({
      nome: item.nome_identificacao,
      entrada: item.data_entrada,
      saida: item.data_saida,
    })),
  )
  const linhas = gerada
    ? visitas.linhas.map((visita) => ({
        chave: visita.id,
        titulo: rotuloVisita(visita.numero_visita, contrato.quantidade_visitas),
        data: dataHumana(visita.data_programada_atual),
        extra: visita.prestador_nome ?? 'Sem prestador',
        equipamentos: visita.equipamentos,
        selo: rotuloStatusVisita(visita.status),
      }))
    : previsao.map((visita) => ({
        chave: String(visita.numero),
        titulo: rotuloVisita(visita.numero, contrato.quantidade_visitas),
        data: dataHumana(visita.data),
        extra: contrato.prestador_nome ?? 'Sem prestador',
        equipamentos: visita.equipamentos,
        selo: 'A gerar',
      }))

  return (
    <Painel atual="contratos">
      <Passos
        atual={gerada ? 'programacao' : 'conferir'}
        contratoId={contrato.id}
        equipamentos={equipamentos.linhas.length}
        gerada={gerada}
      />
      <h1>{gerada ? 'Programação' : 'Conferir'}</h1>
      <p className="subtitulo">
        {rotuloContrato(contrato.numero_contrato)} · {contrato.condominio_nome}
      </p>
      <Orientacao texto={guia.texto} />
      <Avisos erro={query.erro} salvo={query.salvo} />
      {alerta ? (
        <p className="alerta" role="status">
          {alerta}
        </p>
      ) : null}
      {equipamentos.erro || visitas.erro ? (
        <p className="aviso" role="alert">
          {equipamentos.erro || visitas.erro}
        </p>
      ) : null}

      <section className="bloco">
        <h2>Contrato</h2>
        <dl className="ficha">
          <div>
            <dt>Condomínio</dt>
            <dd>{contrato.condominio_nome}</dd>
          </div>
          <div>
            <dt>Número</dt>
            <dd>{rotuloContrato(contrato.numero_contrato)}</dd>
          </div>
          <div>
            <dt>Início do contrato</dt>
            <dd>{dataHumana(contrato.data_inicio_contrato)}</dd>
          </div>
          <div>
            <dt>Início da manutenção</dt>
            <dd>{dataHumana(contrato.data_inicio_manutencao)}</dd>
          </div>
          <div>
            <dt>Fim do contrato</dt>
            <dd>{contrato.data_fim_contrato ? dataHumana(contrato.data_fim_contrato) : 'Não informado'}</dd>
          </div>
          <div>
            <dt>Visitas</dt>
            <dd>{textoVisitas(contrato.quantidade_visitas)}</dd>
          </div>
          <div>
            <dt>Prestador padrão</dt>
            <dd>{contrato.prestador_nome ?? 'Sem prestador padrão'}</dd>
          </div>
          <div>
            <dt>Situação</dt>
            <dd>{rotuloStatusContrato(contrato.status)}</dd>
          </div>
        </dl>
        <div className="acoes">
          <a className="botao botao-secundario" href={`/adm/contratos/${contrato.id}`}>
            Corrigir contrato
          </a>
        </div>
      </section>

      <section className="bloco">
        <h2>Equipamentos</h2>
        {equipamentos.linhas.length === 0 ? <p className="vazio">Nenhum equipamento neste contrato.</p> : null}
        <ul className="historico">
          {equipamentos.linhas.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.nome_identificacao}</strong>
                <span className="meta">
                  {item.matriz_nome} · {periodoEquipamento(item.data_entrada, item.data_saida)}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <div className="acoes">
          <a className="botao botao-secundario" href={`/adm/contratos/${contrato.id}/equipamentos`}>
            {equipamentos.linhas.length === 0 ? 'Adicionar equipamentos' : 'Corrigir equipamentos'}
          </a>
        </div>
      </section>

      <section className="bloco" id="programacao">
        <h2>Programação</h2>
        <p className="nota">Uma visita por mês, a partir do início da manutenção. O fim do contrato não muda esta lista.</p>
        {linhas.length === 0 ? <p className="vazio">Nenhuma visita nesta programação.</p> : null}
        <ul className="historico">
          {linhas.map((linha) => (
            <li key={linha.chave}>
              <div>
                <strong>{linha.titulo}</strong>
                <span className="meta">
                  {linha.data} · {linha.extra}
                </span>
                <span className="meta">{linha.equipamentos.length > 0 ? linha.equipamentos.join(', ') : 'Nenhum equipamento nesta data.'}</span>
              </div>
              <span className={linha.selo === 'A gerar' ? 'selo selo-inativo' : 'selo'}>{linha.selo}</span>
            </li>
          ))}
        </ul>
        {!gerada && contrato.status === 'ativo' && equipamentos.linhas.length > 0 ? (
          <form action={gerarProgramacao}>
            <input type="hidden" name="contrato_id" value={contrato.id} />
            <div className="acoes">
              <BotaoSubmit pendenteTexto="Gerando…">Gerar programação</BotaoSubmit>
            </div>
          </form>
        ) : null}
        {!gerada && contrato.status !== 'ativo' ? <p className="nota">A programação só é gerada com o contrato ativo.</p> : null}
        {!gerada && equipamentos.linhas.length === 0 ? <p className="nota">Adicione ao menos um equipamento antes de gerar a programação.</p> : null}
      </section>
    </Painel>
  )
}
