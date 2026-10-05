import { caminhoEtapa, type EtapaContrato } from '@/lib/contratos'
import { Painel } from '@/app/adm/componentes/Painel'

const ordem: { id: EtapaContrato; rotulo: string }[] = [
  { id: 'contrato', rotulo: 'Contrato' },
  { id: 'equipamentos', rotulo: 'Equipamentos' },
  { id: 'conferir', rotulo: 'Conferir' },
  { id: 'programacao', rotulo: 'Programação' },
]

function hrefPasso(contratoId: string | null, etapa: EtapaContrato) {
  if (!contratoId) return null
  if (etapa === 'contrato') return `/adm/contratos/${contratoId}`
  return caminhoEtapa(contratoId, etapa === 'programacao' ? 'programacao' : etapa === 'equipamentos' ? 'equipamentos' : 'conferir')
}

export function Passos({
  atual,
  contratoId,
  equipamentos,
  gerada,
}: {
  atual: EtapaContrato
  contratoId: string | null
  equipamentos: number
  gerada: boolean
}) {
  return (
    <ol className="passos" aria-label="Passos do contrato">
      {ordem.map((passo, indice) => {
        const href = hrefPasso(contratoId, passo.id)
        const concluido =
          (passo.id === 'contrato' && Boolean(contratoId)) ||
          (passo.id === 'equipamentos' && equipamentos > 0) ||
          ((passo.id === 'conferir' || passo.id === 'programacao') && gerada)
        const classe = passo.id === atual ? 'atual' : concluido ? 'feito' : undefined
        const conteudo = (
          <>
            <span aria-hidden="true">{indice + 1}</span>
            {passo.rotulo}
          </>
        )
        if (!href || passo.id === atual) {
          return (
            <li key={passo.id}>
              <span className={classe} aria-current={passo.id === atual ? 'step' : undefined} aria-disabled={!href && passo.id !== atual ? true : undefined}>
                {conteudo}
              </span>
            </li>
          )
        }
        return (
          <li key={passo.id}>
            <a className={classe} href={href}>
              {conteudo}
            </a>
          </li>
        )
      })}
    </ol>
  )
}

export function Orientacao({ texto, href, rotulo }: { texto: string; href?: string; rotulo?: string }) {
  return (
    <div className="proximo" role="status">
      <p>{texto}</p>
      {href && rotulo ? (
        <div className="acoes">
          <a className="botao" href={href}>
            {rotulo}
          </a>
        </div>
      ) : null}
    </div>
  )
}

export function ContratoNaoEncontrado() {
  return (
    <Painel atual="contratos">
      <h1>Contrato</h1>
      <p className="vazio">Contrato não encontrado.</p>
      <div className="acoes">
        <a className="botao botao-secundario" href="/adm/contratos">
          Voltar
        </a>
      </div>
    </Painel>
  )
}
