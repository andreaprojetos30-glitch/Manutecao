import { textoCanceladasForaDoSaldo, textoVisitas, type ResumoContrato } from '@/lib/contratos'

export function ResumoVisitas({ resumo }: { resumo: ResumoContrato }) {
  const canceladas = textoCanceladasForaDoSaldo(resumo.canceladas)

  return (
    <section className="bloco">
      <h2>Resumo das visitas</h2>
      <dl className="ficha">
        <div>
          <dt>Total de visitas contratadas</dt>
          <dd>{textoVisitas(resumo.contratadas)}</dd>
        </div>
        <div>
          <dt>Visitas realizadas anteriormente</dt>
          <dd>{textoVisitas(resumo.anteriores)}</dd>
        </div>
        <div>
          <dt>Visitas realizadas pelo sistema</dt>
          <dd>{textoVisitas(resumo.realizadasSistema)}</dd>
        </div>
        <div>
          <dt>Visitas restantes</dt>
          <dd>{textoVisitas(resumo.restantes)}</dd>
        </div>
        <div>
          <dt>Próxima visita</dt>
          <dd>{resumo.proxima}</dd>
        </div>
      </dl>
      {canceladas ? <p className="nota">{canceladas}</p> : null}
      <p className="nota">Manutenção avulsa e retorno técnico não entram neste saldo.</p>
    </section>
  )
}
