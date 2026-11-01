import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { ativarAcompanhamento } from '@/app/adm/manutencoes/acoes-acompanhamento'
import { rotuloSituacao, SITUACOES_ACOMPANHAMENTO, type SituacaoAcompanhamento } from '@/lib/acompanhamento-comprovante'

export function PainelAcompanhamento({
  ativado,
  contagens,
  atual,
  busca,
  caminho = '/adm/manutencoes',
}: {
  ativado: boolean
  contagens: Record<SituacaoAcompanhamento, number> | null
  atual: SituacaoAcompanhamento | null
  busca: string
  caminho?: string
}) {
  if (!ativado) {
    return (
      <section className="marco-acompanhamento">
        <h2>Acompanhamento</h2>
        <p>O acompanhamento dos comprovantes ainda não foi iniciado.</p>
        <p className="nota">Os comprovantes já liberados continuam na ficha e não entram sozinhos.</p>
        <form action={ativarAcompanhamento}>
          <label className="confirma">
            <input type="checkbox" name="confirmacao" value="iniciar acompanhamento" required />
            Confirmo o início do acompanhamento a partir de agora.
          </label>
          <div className="acoes">
            <BotaoSubmit pendenteTexto="Iniciando…">Iniciar acompanhamento</BotaoSubmit>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section>
      <h2>Acompanhamento</h2>
      <p className="nota">Os números consideram todos os períodos.</p>
      <div className="indicadores">
        {SITUACOES_ACOMPANHAMENTO.map((situacao) => (
          <a
            key={situacao}
            className={situacao === 'mais_de_3_dias' ? 'critico' : undefined}
            href={endereco(caminho, situacao, atual ? busca : '')}
            aria-current={atual === situacao ? 'page' : undefined}
          >
            <strong>{contagens?.[situacao] ?? 0}</strong>
            <span>{rotuloSituacao(situacao)}</span>
          </a>
        ))}
      </div>
    </section>
  )
}

function endereco(caminho: string, situacao: SituacaoAcompanhamento, busca: string) {
  const params = new URLSearchParams({ acompanhamento: situacao })
  if (busca) params.set('q', busca)
  return `${caminho}?${params}`
}
