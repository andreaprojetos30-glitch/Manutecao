import { dataHumana } from '@/lib/cadastros'
import {
  mensagemListaAcompanhamento,
  montarListaAcompanhamento,
  rotuloSituacao,
  situacaoAcompanhamento,
  textoAlertaWhatsapp,
  textoDiasAguardando,
} from '@/lib/acompanhamento-comprovante'
import { dataHoraHumana } from '@/lib/manutencoes'

export function ListaAcompanhamento({
  modo,
  busca,
  linhas,
  caminho = '/adm/manutencoes',
  hrefLinha,
  hrefContato,
}: {
  modo: NonNullable<ReturnType<typeof situacaoAcompanhamento>>
  busca: string
  linhas: ReturnType<typeof montarListaAcompanhamento>['linhas']
  caminho?: string
  hrefLinha?: (manutencaoId: string) => string
  hrefContato?: (condominioId: string) => string
}) {
  const vazia = mensagemListaAcompanhamento(modo, busca, linhas.length)
  return (
    <>
      <form className="busca" action={caminho} method="get">
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
            <a className={linha.situacao === 'mais_de_3_dias' ? 'atrasada' : undefined} href={hrefLinha?.(linha.manutencaoId) ?? `/adm/manutencoes/${linha.manutencaoId}`}>
              <strong>{linha.condominioNome}</strong>
              <span className="meta">Manutenção em {dataHumana(linha.dataManutencao)}</span>
              {linha.dias !== null ? <span className="meta">Aguardando confirmação {textoDiasAguardando(linha.dias)}</span> : null}
              {linha.primeiroEnvioEm ? <span className="meta">Primeiro envio em {dataHoraHumana(linha.primeiroEnvioEm)}</span> : null}
              {linha.confirmadoEm ? <span className="meta">Confirmação em {dataHoraHumana(linha.confirmadoEm)}</span> : null}
              {linha.ultimoLembreteEm ? <span className="meta">Último lembrete em {dataHoraHumana(linha.ultimoLembreteEm)}</span> : null}
              {linha.dias !== null && !linha.ultimoLembreteEm ? <span className="meta">Nenhum lembrete registrado</span> : null}
              {linha.situacao === 'mais_de_3_dias' ? <span className="selo selo-atrasada">Mais de 3 dias</span> : null}
            </a>
            {linha.alertaWhatsapp ? (
              <p className="aviso">
                {textoAlertaWhatsapp(Boolean(linha.primeiroEnvioEm))}{' '}
                <a href={hrefContato?.(linha.condominioId) ?? `/adm/condominios/${linha.condominioId}`}>Atualizar contato</a>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  )
}
