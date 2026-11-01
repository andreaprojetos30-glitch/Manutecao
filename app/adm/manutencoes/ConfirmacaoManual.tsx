import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { corrigirConfirmacaoManual, registrarConfirmacaoManual } from '@/app/adm/manutencoes/acoes-confirmacao'
import { LIMITE_JUSTIFICATIVA_CONFIRMACAO, ROTULO_SEM_VALIDADE, type ResumoConfirmacaoManual } from '@/lib/confirmacao-manual'
import { rotuloPapelDestinatario } from '@/lib/destinatario-comprovante'
import { dataHoraHumana } from '@/lib/manutencoes'

export function ConfirmacaoManual({
  visitaId,
  indisponivel,
  resumo,
}: {
  visitaId: string
  indisponivel: boolean
  resumo: ResumoConfirmacaoManual | null
}) {
  if (indisponivel || !resumo) {
    return (
      <div>
        <h3>Registro pelo ADM</h3>
        <p className="nota">O registro manual da confirmação ainda não está disponível neste ambiente.</p>
      </div>
    )
  }

  return (
    <div>
      <h3>Registro pelo ADM</h3>
      <p className="nota">
        O registro manual vale quando quem recebe informa o recebimento e não consegue usar o link. Ele não equivale a assinatura eletrônica nem a confirmação direta dessa pessoa.
      </p>
      {resumo.origemVigente === 'link' && resumo.vigenteEm ? (
        <div>
          <p>Confirmação pelo link em {dataHoraHumana(resumo.vigenteEm)}.</p>
          {resumo.vigenteResponsavel ? (
            <p className="nota">Quem consta no registro: {resumo.vigenteResponsavel}{resumo.vigentePapel ? `, ${rotuloPapelDestinatario(resumo.vigentePapel)}` : ''}.</p>
          ) : null}
          <p><a href={`/adm/manutencoes/${visitaId}/confirmacao?origem=link`}>Abrir comprovante da confirmação{resumo.vigenteCodigo ? ` ${resumo.vigenteCodigo}` : ''}</a></p>
        </div>
      ) : null}
      {resumo.origemVigente === 'manual' && resumo.vigenteRegistroId ? (
        <div>
          <p>Registro manual pelo ADM em {dataHoraHumana(resumo.vigenteEm)}.</p>
          <p className="nota">Quem registrou: {resumo.vigenteResponsavel}. Destinatário autorizado naquele momento: {resumo.vigenteDestinatario}.</p>
          <p>{resumo.vigenteJustificativa}</p>
          <p><a href={`/adm/manutencoes/${visitaId}/confirmacao?registro=${resumo.vigenteRegistroId}`}>Abrir comprovante da confirmação{resumo.vigenteCodigo ? ` ${resumo.vigenteCodigo}` : ''}</a></p>
          <form action={corrigirConfirmacaoManual}>
            <input type="hidden" name="visita_id" value={visitaId} />
            <input type="hidden" name="registro_id" value={resumo.vigenteRegistroId} />
            <label>
              Justificativa da correção
              <textarea name="justificativa" rows={3} required maxLength={LIMITE_JUSTIFICATIVA_CONFIRMACAO} />
            </label>
            <div className="acoes">
              <BotaoSubmit secundario pendenteTexto="Corrigindo…">Corrigir este registro</BotaoSubmit>
            </div>
          </form>
        </div>
      ) : null}
      {resumo.historico.some((linha) => linha.correcaoEm) ? (
        <ul className="historico">
          {resumo.historico.filter((linha) => linha.correcaoEm).map((linha) => (
            <li key={linha.registroId}>
              <div>
                <strong>Registro manual</strong>
                <span className="meta">{dataHoraHumana(linha.registradoEm)} · {linha.responsavel}</span>
                <span className="alerta">{ROTULO_SEM_VALIDADE}</span>
                <p>{linha.justificativa}</p>
                <p className="nota">Correção em {dataHoraHumana(linha.correcaoEm)} por {linha.correcaoResponsavel}. {linha.correcaoJustificativa}</p>
              </div>
              <a href={`/adm/manutencoes/${visitaId}/confirmacao?registro=${linha.registroId}`}>Abrir documento original{linha.codigo ? ` ${linha.codigo}` : ''}</a>
              <a href={`/adm/manutencoes/${visitaId}/confirmacao?registro=${linha.registroId}&peca=declaracao`}>Abrir declaração de correção{linha.declaracaoCodigo ? ` ${linha.declaracaoCodigo}` : ''}</a>
            </li>
          ))}
        </ul>
      ) : null}
      {resumo.podeRegistrar ? (
        <form action={registrarConfirmacaoManual}>
          <input type="hidden" name="visita_id" value={visitaId} />
          <label>
            Justificativa
            <textarea name="justificativa" rows={3} required maxLength={LIMITE_JUSTIFICATIVA_CONFIRMACAO} placeholder="Quem recebe informou o recebimento e não conseguiu usar o link." />
          </label>
          <div className="acoes">
            <BotaoSubmit pendenteTexto="Registrando…">Registrar confirmação manual</BotaoSubmit>
          </div>
        </form>
      ) : null}
    </div>
  )
}
