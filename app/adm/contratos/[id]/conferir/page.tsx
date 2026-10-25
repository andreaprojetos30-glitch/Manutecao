import { Avisos } from '@/app/adm/componentes/Avisos'
import { Painel } from '@/app/adm/componentes/Painel'
import { gerarProgramacao, registrarVisitasAnteriores } from '@/app/adm/contratos/acoes'
import { FormVisitasAnteriores } from '@/app/adm/contratos/FormVisitasAnteriores'
import { LinhaEquipamento } from '@/app/adm/contratos/LinhaEquipamento'
import { ContratoNaoEncontrado, Orientacao, Passos } from '@/app/adm/contratos/Passos'
import { dataHumana } from '@/lib/cadastros'
import { equipamentosDoContrato, lerContrato, visitasDoContrato } from '@/lib/consultas-contrato'
import {
  fimContratoCalculado,
  limiteVisitasAnteriores,
  motivoSemVisitasAnteriores,
  orientacaoContrato,
  preverProgramacao,
  rotuloComposicao,
  rotuloContrato,
  rotuloStatusContrato,
  rotuloStatusVisita,
  rotuloUnidade,
  rotuloVisita,
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
  const fim = fimContratoCalculado(contrato.data_inicio_manutencao.slice(0, 10), String(contrato.quantidade_visitas))
  const previsao = preverProgramacao(
    contrato.data_inicio_manutencao.slice(0, 10),
    contrato.quantidade_visitas,
    equipamentos.linhas.map((item) => ({ nome: rotuloUnidade(item.matriz_nome, item.identificacao) })),
  )
  const limiteAnteriores = limiteVisitasAnteriores(visitas.linhas)
  const linhas = gerada
    ? visitas.linhas.map((visita) => ({
        chave: visita.id,
        titulo: rotuloVisita(visita.numero_visita, contrato.quantidade_visitas),
        data: visita.registro_anterior && visita.data_realizada
          ? `Realizada em ${dataHumana(visita.data_realizada)} · programada em ${dataHumana(visita.data_programada_atual)}`
          : dataHumana(visita.data_programada_atual),
        extra: visita.registro_anterior ? 'Registro anterior' : (visita.prestador_nome ?? 'Sem prestador'),
        equipamentos: visita.equipamentos,
        selo: visita.registro_anterior ? 'Registro anterior' : rotuloStatusVisita(visita.status),
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
            <dt>Contrato</dt>
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
            <dt>Quantidade de visitas</dt>
            <dd>{textoVisitas(contrato.quantidade_visitas)}</dd>
          </div>
          <div>
            <dt>Fim do contrato</dt>
            <dd>{dataHumana(fim)}</dd>
          </div>
          <div>
            <dt>Prestador</dt>
            <dd>{contrato.prestador_nome ?? 'Sem prestador'}</dd>
          </div>
          <div>
            <dt>Equipamentos</dt>
            <dd>{String(equipamentos.linhas.length)}</dd>
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
        <h2>{rotuloComposicao(equipamentos.linhas.length)}</h2>
        {equipamentos.linhas.length === 0 ? <p className="vazio">Nenhum equipamento neste contrato.</p> : null}
        <ul className="historico composicao">
          {equipamentos.linhas.map((item) => (
            <li key={item.id}>
              <LinhaEquipamento nome={item.matriz_nome} identificacao={item.identificacao} />
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
        <p className="nota">Uma visita por mês, a partir do início da manutenção. O fim do contrato é a data da última visita dessa programação.</p>
        {linhas.length === 0 ? <p className="vazio">Nenhuma visita nesta programação.</p> : null}
        <ul className="historico">
          {linhas.map((linha) => (
            <li key={linha.chave}>
              <div>
                <strong>{linha.titulo}</strong>
                <span className="meta">
                  {linha.data} · {linha.extra}
                </span>
                <span className="meta">
                  {linha.equipamentos.length > 0
                    ? linha.equipamentos.join(', ')
                    : linha.selo === 'Registro anterior'
                      ? 'Sem checklist nem evidência do aplicativo.'
                      : 'Nenhum equipamento nesta data.'}
                </span>
              </div>
              <span className={linha.selo === 'A gerar' ? 'selo selo-inativo' : 'selo'}>{linha.selo}</span>
            </li>
          ))}
        </ul>
        {!gerada && contrato.status === 'ativo' && equipamentos.linhas.length > 0 ? (
          <FormVisitasAnteriores
            action={gerarProgramacao}
            contratoId={contrato.id}
            total={contrato.quantidade_visitas}
            maximo={Math.max(contrato.quantidade_visitas - 1, 0)}
            rotulo="Gerar programação"
            nota="Informe zero se nenhuma visita aconteceu antes do sistema. O início da manutenção permanece a data da visita 1."
            confirmacao="Confirmo que estas visitas já ocorreram antes do sistema e não terão ficha nem comprovante"
          />
        ) : null}
        {!gerada && contrato.status !== 'ativo' ? <p className="nota">A programação só é gerada com o contrato ativo.</p> : null}
        {!gerada && equipamentos.linhas.length === 0 ? <p className="nota">Adicione ao menos um equipamento antes de gerar a programação.</p> : null}
      </section>

      {gerada ? (
        <section className="bloco">
          <h2>Registrar visitas anteriores</h2>
          {visitas.erro ? (
            <p className="nota">Não foi possível verificar quais visitas podem ser registradas.</p>
          ) : limiteAnteriores > 0 && contrato.quantidade_visitas > 1 ? (
            <FormVisitasAnteriores
              action={registrarVisitasAnteriores}
              contratoId={contrato.id}
              total={contrato.quantidade_visitas}
              maximo={Math.min(limiteAnteriores, contrato.quantidade_visitas - 1)}
              rotulo="Registrar visitas anteriores"
              nota="Retira somente visitas ainda intactas, a partir da primeira. A próxima conserva o número e a data mensal."
              confirmacao="Confirmo a retirada dessas visitas anteriores ainda intactas. Visitas executadas, ocorrências e comprovantes permanecem."
              gerada
            />
          ) : limiteAnteriores > 0 ? (
            <p className="nota">A próxima visita precisa permanecer na programação.</p>
          ) : (
            <p className="nota">{motivoSemVisitasAnteriores(visitas.linhas, contrato.quantidade_visitas)}</p>
          )}
        </section>
      ) : null}
    </Painel>
  )
}
