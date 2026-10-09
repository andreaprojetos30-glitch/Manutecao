import { Avisos } from '@/app/adm/componentes/Avisos'
import { Painel } from '@/app/adm/componentes/Painel'
import { BuscaManutencao } from '@/app/adm/manutencoes/BuscaManutencao'
import { dataHumana, hojeIso } from '@/lib/cadastros'
import { opcoesPrestador } from '@/lib/consultas-contrato'
import { listarManutencoes } from '@/lib/consultas-manutencao'
import { rotuloManutencao, textoManutencoes, visitaAtrasada } from '@/lib/manutencoes'
import { rotuloStatusVisita } from '@/lib/contratos'

export const metadata = { title: 'Manutenções · ELEVA Manutenção' }

export default async function ManutencoesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; prestador?: string; de?: string; ate?: string; erro?: string; salvo?: string }>
}) {
  const params = await searchParams
  const [lista, prestadores] = await Promise.all([
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
      {lista.erro ? (
        <p className="aviso" role="alert">
          {lista.erro}
        </p>
      ) : null}
      <BuscaManutencao
        q={lista.termo}
        status={lista.status}
        prestador={lista.prestador}
        inicio={lista.inicio}
        fim={lista.fim}
        prestadores={prestadores.map((item) => ({ id: item.id, nome: item.nome }))}
      />
      <p className="contador" role="status">
        {textoManutencoes(lista.linhas.length)}
      </p>
      {lista.limite ? <p className="limite">Há mais resultados. Refine a busca.</p> : null}
      {lista.linhas.length === 0 ? <p className="vazio">Nenhuma manutenção encontrada.</p> : null}
      <ul className="lista">
        {lista.linhas.map((item) => {
          const atrasada = visitaAtrasada(item.status, item.data_programada_atual, hoje)
          return (
            <li key={item.id}>
              <a className={atrasada ? 'atrasada' : undefined} href={`/adm/manutencoes/${item.id}`}>
                <strong>{rotuloManutencao(item.tipo, item.numero_visita, item.quantidade_visitas)}</strong>
                <span className="meta">
                  {item.condominio_nome} · {dataHumana(item.data_programada_atual)} · {item.prestador_nome ?? 'Sem prestador'}
                </span>
                <span className={atrasada ? 'selo selo-atrasada' : item.status === 'programada' ? 'selo' : 'selo selo-inativo'}>
                  {atrasada ? 'Atrasada' : rotuloStatusVisita(item.status)}
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </Painel>
  )
}

function listaPrestadorAtual(valor: string | undefined) {
  return valor && /^[0-9a-f-]{36}$/i.test(valor) ? valor : null
}
