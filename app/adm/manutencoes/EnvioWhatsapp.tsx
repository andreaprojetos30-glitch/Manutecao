'use client'

import { useState, useTransition } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { confirmarEnvioWhatsapp, corrigirEnvioWhatsapp, prepararEnvioWhatsapp } from '@/app/adm/manutencoes/acoes-whatsapp'
import { dataHoraHumana } from '@/lib/manutencoes'
import { mensagemDoMotivo, type ResumoEnvio } from '@/lib/whatsapp-comprovante-resumo'

export function EnvioWhatsapp({ visitaId, resumo }: { visitaId: string; resumo: ResumoEnvio }) {
  const [erro, setErro] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [aguardando, setAguardando] = useState(false)
  const [pendente, iniciar] = useTransition()
  const envioAberto = resumo.historico.some((linha) => linha.classe === 'envio' && !linha.correcaoEm)
  const corrigivel = [...resumo.historico].reverse().find((linha) => linha.classe !== 'correcao' && !linha.correcaoEm)

  return (
    <div>
      <h3>Envio pelo WhatsApp</h3>
      {resumo.historico.map((linha) => (
        <p key={linha.id} className="nota">
          {rotulo(linha.classe)} em {dataHoraHumana(linha.registradoEm)} por {linha.responsavel}.
          {linha.correcaoEm ? ` Corrigido em ${dataHoraHumana(linha.correcaoEm)}. O registro permanece.` : ''}
        </p>
      ))}
      {resumo.podePreparar ? (
        <p className="nota">
          Abrir o WhatsApp não registra o envio. Depois de enviar a mensagem, confirme aqui.
        </p>
      ) : (
        <p className="nota">{mensagemDoMotivo(resumo.motivo)}</p>
      )}
      {erro ? (
        <p className="aviso" role="alert">
          {erro}
        </p>
      ) : null}
      {mensagem ? (
        <div>
          <p className="nota">Mensagem de conferência. O WhatsApp não será aberto.</p>
          {mensagem.split('\n').map((trecho, indice) => (
            <p key={indice}>{trecho || '\u00a0'}</p>
          ))}
        </div>
      ) : null}
      {resumo.podePreparar ? (
        <div className="acoes">
          <button
            type="button"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                setErro(null)
                const resultado = await prepararEnvioWhatsapp(visitaId)
                if ('erro' in resultado) {
                  setErro(resultado.erro)
                  setAguardando(false)
                  return
                }
                if (resultado.modo === 'laboratorio') {
                  setMensagem(resultado.mensagem)
                  setAguardando(true)
                  return
                }
                if (resultado.destino.startsWith('https://wa.me/')) {
                  window.open(resultado.destino, '_blank', 'noopener,noreferrer')
                  setMensagem(null)
                  setAguardando(true)
                  return
                }
                setErro('Não foi possível preparar a mensagem.')
                setAguardando(false)
              })
            }
          >
            {pendente ? 'Preparando…' : envioAberto ? 'Enviar lembrete' : 'Enviar pelo WhatsApp'}
          </button>
        </div>
      ) : null}
      {aguardando ? (
        <form action={confirmarEnvioWhatsapp}>
          <input type="hidden" name="visita_id" value={visitaId} />
          <div className="acoes">
            <BotaoSubmit pendenteTexto="Registrando…">
              {envioAberto ? 'Confirmar lembrete' : 'Confirmar envio'}
            </BotaoSubmit>
          </div>
        </form>
      ) : null}
      {corrigivel ? (
        <form action={corrigirEnvioWhatsapp}>
          <input type="hidden" name="visita_id" value={visitaId} />
          <input type="hidden" name="referencia_id" value={corrigivel.id} />
          <div className="acoes">
            <BotaoSubmit secundario pendenteTexto="Corrigindo…">
              Corrigir este registro
            </BotaoSubmit>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function rotulo(classe: ResumoEnvio['historico'][number]['classe']) {
  if (classe === 'lembrete') return 'Lembrete registrado'
  if (classe === 'correcao') return 'Correção registrada'
  return 'Envio registrado'
}
