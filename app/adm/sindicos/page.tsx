import { Avisos } from '@/app/adm/componentes/Avisos'
import { Busca } from '@/app/adm/componentes/Busca'
import { Painel } from '@/app/adm/componentes/Painel'
import { periodoSindico } from '@/lib/cadastros'
import { listarSindicos } from '@/lib/consultas-cadastro'

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
        {lista.pessoas.map((pessoa) => {
          const ativos = pessoa.vinculos.filter((vinculo) => vinculo.ativo)
          const historico = pessoa.vinculos.filter((vinculo) => !vinculo.ativo)
          return (
            <li key={pessoa.id}>
              <strong>{pessoa.nome}</strong>
              <span className="meta">
                {pessoa.whatsapp || 'Sem WhatsApp'}
                {pessoa.email ? ` · ${pessoa.email}` : ''}
              </span>
              <p className="nota">Ativos</p>
              {ativos.length === 0 ? <p className="vazio">Nenhum condomínio ativo.</p> : null}
              <ul className="vinculos">
                {ativos.map((vinculo) => (
                  <li key={vinculo.id}>
                    <a href={`/adm/condominios/${vinculo.condominioId}#sindicos`}>
                      <strong>{vinculo.condominioNome}</strong>
                      <span className="meta">{periodoSindico(vinculo.dataInicio, vinculo.dataFim, true)}</span>
                      <span className="selo">Ativo</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="nota">Histórico</p>
              {historico.length === 0 ? <p className="vazio">Sem histórico.</p> : null}
              <ul className="vinculos">
                {historico.map((vinculo) => (
                  <li key={vinculo.id}>
                    <a href={`/adm/condominios/${vinculo.condominioId}#sindicos`}>
                      <strong>{vinculo.condominioNome}</strong>
                      <span className="meta">{periodoSindico(vinculo.dataInicio, vinculo.dataFim, false)}</span>
                      <span className="selo">Histórico</span>
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </Painel>
  )
}
