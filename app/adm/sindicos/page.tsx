import { Avisos } from '@/app/adm/componentes/Avisos'
import { Busca } from '@/app/adm/componentes/Busca'
import { Painel } from '@/app/adm/componentes/Painel'
import { buscaAbrePessoaSindico, periodoSindico, textoCondominiosAtivos } from '@/lib/cadastros'
import { listarSindicos, type PessoaSindicoLista } from '@/lib/consultas-cadastro'

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
      <p className="nota">
        Cada pessoa reúne os condomínios em que administra agora e os períodos já encerrados. A troca não apaga o
        histórico.
      </p>
      <Avisos erro={params.erro} salvo={params.salvo} />
      {lista.erro ? (
        <p className="aviso" role="alert">
          {lista.erro}
        </p>
      ) : null}
      <Busca
        acao="/adm/sindicos"
        q={lista.termo}
        situacao={lista.situacao}
        placeholder="Nome da pessoa, WhatsApp ou condomínio"
      />
      {lista.limite ? <p className="limite">Há mais resultados. Refine a busca.</p> : null}
      {lista.pessoas.length === 0 ? <p className="vazio">Nenhum síndico encontrado.</p> : null}
      <ul className="lista pessoas-sindico">
        {lista.pessoas.map((pessoa) => (
          <LinhaSindico key={pessoa.id} pessoa={pessoa} termo={lista.termo} />
        ))}
      </ul>
    </Painel>
  )
}

function LinhaSindico({ pessoa, termo }: { pessoa: PessoaSindicoLista; termo: string }) {
  const ativos = pessoa.vinculos.filter((vinculo) => vinculo.ativo)
  const historico = pessoa.vinculos.filter((vinculo) => !vinculo.ativo)
  const aberto = buscaAbrePessoaSindico(
    termo,
    pessoa.vinculos.map((vinculo) => vinculo.condominioNome),
  )

  return (
    <li>
      <details className="sindico" open={aberto}>
        <summary>
          <span className="sindico-resumo">
            <strong>{pessoa.nome}</strong>
            <span className="meta">{pessoa.whatsapp || 'Sem WhatsApp'}</span>
            <span className="contagem">{textoCondominiosAtivos(ativos.length)}</span>
            <span className="seta" aria-hidden="true" />
          </span>
        </summary>
        <div className="sindico-detalhe">
          {pessoa.email ? <p className="meta sindico-email">{pessoa.email}</p> : null}
          <Vinculos titulo="Ativos" itens={ativos} vazio="Nenhum condomínio ativo." ativo />
          <Vinculos titulo="Histórico" itens={historico} vazio="Sem histórico." ativo={false} />
        </div>
      </details>
    </li>
  )
}

function Vinculos({
  titulo,
  itens,
  vazio,
  ativo,
}: {
  titulo: string
  itens: PessoaSindicoLista['vinculos']
  vazio: string
  ativo: boolean
}) {
  return (
    <>
      <p className="nota">{titulo}</p>
      {itens.length === 0 ? <p className="vazio">{vazio}</p> : null}
      <ul className="vinculos">
        {itens.map((vinculo) => (
          <li key={vinculo.id}>
            <a href={`/adm/condominios/${vinculo.condominioId}#sindicos`}>
              <strong>{vinculo.condominioNome}</strong>
              <span className="meta">{periodoSindico(vinculo.dataInicio, vinculo.dataFim, ativo)}</span>
              <span className="selo">{ativo ? 'Ativo' : 'Histórico'}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}
