import { Avisos } from '@/app/adm/componentes/Avisos'
import { Moldura } from '@/app/componentes/Moldura'
import { Sair } from '@/app/componentes/Sair'
import { dataHumana, hojeIso, textoEquipamentos } from '@/lib/cadastros'
import { listarVisitasPrestador, type VisitaPrestador } from '@/lib/consultas-execucao'
import { acaoVisita } from '@/lib/execucao'
import { rotuloManutencao, visitaAtrasada } from '@/lib/manutencoes'
import { rotuloStatusVisita } from '@/lib/contratos'
import { exigirDestino } from '@/lib/sessao'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Minhas Manutenções · ELEVA Manutenção' }

export default async function PrestadorPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; salvo?: string }>
}) {
  const sessao = await exigirDestino('/prestador')
  const query = await searchParams
  const lista = await listarVisitasPrestador()
  const hoje = hojeIso()
  const abertas = lista.linhas.filter((visita) => visita.status === 'programada' || visita.status === 'em_execucao')
  const historico = lista.linhas
    .filter((visita) => visita.status === 'realizada' || visita.status === 'aguardando_administracao' || visita.status === 'cancelada')
    .sort((a, b) => b.data_programada_atual.localeCompare(a.data_programada_atual))

  return (
    <Moldura campo>
      <section className="campo">
        <h1>Minhas Manutenções</h1>
        <p className="subtitulo">Olá, {sessao.nome}. Estas são as visitas atribuídas a você.</p>
        <Avisos erro={query.erro} salvo={query.salvo} />
        {!lista.ativo ? (
          <p className="aviso" role="alert">
            Seu acesso à execução está inativo. Procure a ELEVA.
          </p>
        ) : null}
        {lista.erro ? (
          <p className="aviso" role="alert">
            {lista.erro}
          </p>
        ) : null}

        <h2>Para fazer</h2>
        {lista.ativo && abertas.length === 0 ? <p className="vazio">Nenhuma manutenção para executar.</p> : null}
        <ul className="visitas">
          {abertas.map((visita) => (
            <Cartao key={visita.id} visita={visita} hoje={hoje} />
          ))}
        </ul>

        <h2>Histórico</h2>
        <p className="nota">Manutenções concluídas ficam aqui somente para consulta.</p>
        {lista.ativo && historico.length === 0 ? <p className="vazio">Nenhum histórico.</p> : null}
        <ul className="visitas">
          {historico.map((visita) => (
            <Cartao key={visita.id} visita={visita} hoje={hoje} />
          ))}
        </ul>
        {lista.limite ? <p className="limite">Há mais manutenções do que esta lista mostra. Procure a ELEVA se faltar alguma visita.</p> : null}
        <Sair />
      </section>
    </Moldura>
  )
}

function Cartao({ visita, hoje }: { visita: VisitaPrestador; hoje: string }) {
  const titulo = rotuloManutencao(visita.tipo, visita.numero_visita, visita.quantidade_visitas)
  const atrasada = visitaAtrasada(visita.status, visita.data_programada_atual, hoje)
  return (
    <li>
      <article>
        <strong>{visita.condominio_nome}</strong>
        <span>
          {titulo} — {dataHumana(visita.data_programada_atual)}
        </span>
        <span>{textoEquipamentos(visita.equipamentos)}</span>
        <span>{atrasada ? 'Atrasada' : rotuloStatusVisita(visita.status)}</span>
        <a className="botao" href={`/prestador/manutencoes/${visita.id}`}>
          {acaoVisita(visita.status)}
        </a>
      </article>
    </li>
  )
}
