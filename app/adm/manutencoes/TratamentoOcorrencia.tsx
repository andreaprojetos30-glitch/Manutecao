import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { programarRetornoOcorrencia, registrarTratamentoOcorrencia } from '@/app/adm/manutencoes/acoes'
import { dataHumana } from '@/lib/cadastros'
import type { MovimentoOcorrencia, RetornoOcorrencia } from '@/lib/consultas-manutencao'
import { rotuloStatusVisita } from '@/lib/contratos'
import { dataHoraHumana } from '@/lib/manutencoes'
import { SITUACOES_OCORRENCIA, rotuloSituacaoOcorrencia, situacaoOcorrencia } from '@/lib/ocorrencias'

export function TratamentoOcorrencia({
  visitaId,
  ocorrenciaId,
  nome,
  resolvidaNoLocal,
  descricao,
  foto,
  situacao,
  providencia,
  solucao,
  historico,
  retornos,
  prestadores,
}: {
  visitaId: string
  ocorrenciaId: string
  nome: string
  resolvidaNoLocal: boolean
  descricao: string
  foto: string | null
  situacao: string
  providencia: string | null
  solucao: string | null
  historico: MovimentoOcorrencia[]
  retornos: RetornoOcorrencia[]
  prestadores: { id: string; nome: string }[]
}) {
  const atual = situacaoOcorrencia(situacao) ?? situacao
  const opcoes = situacaoOcorrencia(situacao)
    ? SITUACOES_OCORRENCIA
    : [situacao, ...SITUACOES_OCORRENCIA]
  const retornoAberto = retornos.find((retorno) => retorno.status === 'programada' || retorno.status === 'em_execucao')

  return (
    <article className="bloco">
      <h3>{nome}</h3>
      <p className="nota">{resolvidaNoLocal ? 'Resolvida no local pelo prestador.' : 'Não resolvida no local. O registro original permanece.'}</p>
      <p>{descricao}</p>
      {foto ? <img className="foto-previa" src={foto} alt={`Foto registrada em ${nome}`} /> : null}
      <p>
        <strong>Situação: </strong>
        {rotuloSituacaoOcorrencia(situacao)}
      </p>
      {providencia ? <p className="nota">Providência: {providencia}</p> : null}
      {solucao ? <p className="nota">Solução: {solucao}</p> : null}

      <h4>Tratamento administrativo</h4>
      <form action={registrarTratamentoOcorrencia}>
        <input type="hidden" name="visita_id" value={visitaId} />
        <input type="hidden" name="ocorrencia_id" value={ocorrenciaId} />
        <div className="grade">
          <label>
            Situação
            <select name="situacao" defaultValue={atual} required>
              {opcoes.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {rotuloSituacaoOcorrencia(opcao)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Observação ou providência
            <textarea name="observacao" rows={3} required maxLength={2000} placeholder="Se marcar Resolvida, descreva a solução adotada." />
          </label>
        </div>
        <p className="nota">A situação da ocorrência não altera o status da visita nem o registro do prestador.</p>
        <div className="acoes">
          <BotaoSubmit pendenteTexto="Salvando…">Salvar tratamento</BotaoSubmit>
        </div>
      </form>

      <h4>Retorno técnico</h4>
      {retornos.length === 0 ? <p className="vazio">Nenhum retorno programado.</p> : null}
      <ul className="historico">
        {retornos.map((retorno) => (
          <li key={retorno.id}>
            <div>
              <strong>
                {dataHumana(retorno.data)} · {retorno.prestadorNome ?? 'Sem prestador'}
              </strong>
              <span className="meta">{rotuloStatusVisita(retorno.status)}</span>
              <a href={`/adm/manutencoes/${retorno.id}`}>Abrir retorno</a>
            </div>
          </li>
        ))}
      </ul>
      {retornoAberto ? (
        <p className="nota">Já existe um retorno em aberto. Conclua ou cancele esse retorno antes de programar outro.</p>
      ) : (
        <form action={programarRetornoOcorrencia}>
          <input type="hidden" name="visita_id" value={visitaId} />
          <input type="hidden" name="ocorrencia_id" value={ocorrenciaId} />
          <p className="nota">O retorno não conta como visita preventiva e não move a programação do contrato.</p>
          <div className="grade">
            <label>
              Data
              <input name="data" type="date" required />
            </label>
            <label>
              Prestador
              <select name="prestador_id" required defaultValue="">
                <option value="" disabled>
                  Selecione
                </option>
                {prestadores.map((prestador) => (
                  <option key={prestador.id} value={prestador.id}>
                    {prestador.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="acoes">
            <BotaoSubmit secundario pendenteTexto="Programando…">
              Programar retorno
            </BotaoSubmit>
          </div>
        </form>
      )}

      <h4>Histórico das providências</h4>
      {historico.length === 0 ? <p className="vazio">Nenhuma providência registrada.</p> : null}
      <ul className="historico">
        {historico.map((item) => (
          <li key={item.id}>
            <div>
              <strong>
                {item.autorNome ?? 'ADM'} · {dataHoraHumana(item.criadoEm)}
              </strong>
              {item.situacaoAnterior && item.situacaoNova ? (
                <span className="meta">
                  {rotuloSituacaoOcorrencia(item.situacaoAnterior)} → {rotuloSituacaoOcorrencia(item.situacaoNova)}
                </span>
              ) : null}
              {item.observacao ? <span className="meta">{item.observacao}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </article>
  )
}
