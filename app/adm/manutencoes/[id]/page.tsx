import { Avisos } from '@/app/adm/componentes/Avisos'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Painel } from '@/app/adm/componentes/Painel'
import { excluirManutencaoAvulsa, reagendarVisita } from '@/app/adm/manutencoes/acoes'
import { dataHumana, hojeIso } from '@/lib/cadastros'
import { historicoReagendamentos, lerManutencao } from '@/lib/consultas-manutencao'
import { dataHoraHumana, rotuloManutencao, visitaAtrasada } from '@/lib/manutencoes'
import { rotuloContrato, rotuloStatusVisita } from '@/lib/contratos'

export const metadata = { title: 'Manutenção · ELEVA Manutenção' }

export default async function ManutencaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string; salvo?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const visita = await lerManutencao(id)
  if (!visita) {
    return (
      <Painel atual="manutencoes">
        <h1>Manutenção</h1>
        <p className="vazio">Manutenção não encontrada.</p>
        <div className="acoes">
          <a className="botao" href="/adm/manutencoes">
            Voltar à agenda
          </a>
        </div>
      </Painel>
    )
  }

  const historico = await historicoReagendamentos(visita.id)
  const hoje = hojeIso()
  const atrasada = visitaAtrasada(visita.status, visita.data_programada_atual, hoje)
  const titulo = rotuloManutencao(visita.tipo, visita.numero_visita, visita.quantidade_visitas)

  return (
    <Painel atual="manutencoes">
      <h1>{titulo}</h1>
      <p className="subtitulo">{visita.condominio_nome}</p>
      <Avisos erro={query.erro} salvo={query.salvo} />
      {atrasada ? <p className="alerta">Esta visita está atrasada. A data ainda pode ser alterada, sem mover as outras.</p> : null}
      {historico.erro ? (
        <p className="aviso" role="alert">
          {historico.erro}
        </p>
      ) : null}

      <dl className="ficha">
        <div>
          <dt>Condomínio</dt>
          <dd>{visita.condominio_nome}</dd>
        </div>
        <div>
          <dt>Data</dt>
          <dd>{dataHumana(visita.data_programada_atual)}</dd>
        </div>
        <div>
          <dt>Data original</dt>
          <dd>{dataHumana(visita.data_programada_original)}</dd>
        </div>
        <div>
          <dt>Prestador</dt>
          <dd>{visita.prestador_nome ?? 'Sem prestador'}</dd>
        </div>
        <div>
          <dt>Visita</dt>
          <dd>{titulo}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{atrasada ? 'Atrasada' : rotuloStatusVisita(visita.status)}</dd>
        </div>
        {visita.numero_contrato ? (
          <div>
            <dt>Contrato</dt>
            <dd>{rotuloContrato(visita.numero_contrato)}</dd>
          </div>
        ) : null}
      </dl>

      <section className="bloco">
        <h2>Equipamentos — {visita.equipamentos.length}</h2>
        {visita.equipamentos.length === 0 ? <p className="vazio">Nenhum equipamento nesta visita.</p> : null}
        <ul className="historico">
          {visita.equipamentos.map((nome, indice) => (
            <li key={`${indice}-${nome}`}>
              <strong>{nome}</strong>
            </li>
          ))}
        </ul>
      </section>

      {visita.status === 'programada' ? (
        <section className="bloco">
          <h2>Reagendar</h2>
          <p className="nota">Altera só esta visita. As demais datas permanecem.</p>
          <FormReagendar id={visita.id} dataAtual={visita.data_programada_atual} />
        </section>
      ) : (
        <p className="nota">Só uma visita programada pode ter a data alterada.</p>
      )}

      <section className="bloco">
        <h2>Histórico de reagendamentos</h2>
        {historico.linhas.length === 0 ? <p className="vazio">Nenhum reagendamento.</p> : null}
        <ul className="historico">
          {historico.linhas.map((item) => (
            <li key={item.id}>
              <div>
                <strong>
                  {dataHumana(item.data_anterior)} → {dataHumana(item.nova_data)}
                </strong>
                <span className="meta">
                  {item.autor_nome ?? 'ADM'} · {dataHoraHumana(item.criado_em)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {visita.tipo === 'avulsa' && visita.status === 'programada' ? (
        <section className="bloco">
          <h2>Excluir manutenção</h2>
          <p className="nota">
            Use somente se esta manutenção avulsa foi cadastrada por engano. A exclusão não altera as outras visitas nem a
            programação dos contratos.
          </p>
          <form action={excluirManutencaoAvulsa}>
            <input type="hidden" name="id" value={visita.id} />
            <label className="confirma">
              <input name="confirmar" type="checkbox" value="sim" required />
              Confirmo a exclusão desta manutenção avulsa
            </label>
            <div className="acoes">
              <BotaoSubmit perigo pendenteTexto="Excluindo…">
                Excluir manutenção
              </BotaoSubmit>
            </div>
          </form>
        </section>
      ) : null}
      {visita.tipo === 'avulsa' && visita.status !== 'programada' ? (
        <p className="nota">
          Manutenção já iniciada ou encerrada não pode ser excluída. O cancelamento administrativo preserva o histórico.
        </p>
      ) : null}

      <div className="acoes">
        <a className="botao botao-secundario" href="/adm/manutencoes">
          Voltar à agenda
        </a>
        {visita.contrato_id ? (
          <a className="botao botao-secundario" href={`/adm/contratos/${visita.contrato_id}/conferir`}>
            Ver contrato
          </a>
        ) : null}
      </div>
    </Painel>
  )
}

function FormReagendar({ id, dataAtual }: { id: string; dataAtual: string }) {
  return (
    <form action={reagendarVisita}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="data_atual" value={dataAtual} />
      <div className="grade">
        <label>
          Nova data
          <input name="data" type="date" required defaultValue={dataAtual} />
        </label>
      </div>
      <div className="acoes">
        <BotaoSubmit pendenteTexto="Reagendando…">Salvar data</BotaoSubmit>
      </div>
    </form>
  )
}
