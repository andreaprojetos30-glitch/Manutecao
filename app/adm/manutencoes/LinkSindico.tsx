'use client'

import { useState, useTransition } from 'react'
import { CopiarLink } from '@/app/adm/prestadores/CopiarLink'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { emitirLinkSindico, revogarLinkSindico } from '@/app/adm/manutencoes/acoes'

export function LinkSindico({
  visitaId,
  indisponivel,
  linkAtivo,
  emitidoEm,
  confirmadoEm,
  sindicoNome,
}: {
  visitaId: string
  indisponivel: boolean
  linkAtivo: boolean
  emitidoEm: string | null
  confirmadoEm: string | null
  sindicoNome: string | null
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ativo, setAtivo] = useState(linkAtivo)
  const [pendente, iniciar] = useTransition()

  if (indisponivel) {
    return (
      <div>
        <h3>Confirmação do síndico</h3>
        <p className="nota">A confirmação do síndico ainda não está disponível neste ambiente.</p>
      </div>
    )
  }

  if (confirmadoEm) {
    return (
      <div>
        <h3>Confirmação do síndico</h3>
        <p>
          Confirmação recebida pelo link em {confirmadoEm}. Este registro não autentica a identidade de quem clicou.
        </p>
        {sindicoNome ? <p className="nota">Síndico naquele momento: {sindicoNome}.</p> : null}
      </div>
    )
  }

  return (
    <div>
      <h3>Confirmação do síndico</h3>
      <p className="nota">
        O endereço aparece só agora e não fica gravado. Gerar outro invalida o anterior na hora. O envio por WhatsApp
        fica para uma etapa seguinte.
      </p>
      {ativo ? (
        <p className="nota">Há um link ativo{emitidoEm ? ` desde ${emitidoEm}` : ''}. O endereço anterior não abre mais.</p>
      ) : null}
      {erro ? (
        <p className="aviso" role="alert">
          {erro}
        </p>
      ) : null}
      {url ? (
        <div>
          <p className="link-gerado">{url}</p>
          <CopiarLink url={url} />
        </div>
      ) : null}
      <div className="acoes">
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setErro(null)
              const resultado = await emitirLinkSindico(visitaId)
              if ('url' in resultado) {
                setUrl(resultado.url)
                setAtivo(true)
                return
              }
              setErro(resultado.erro)
            })
          }
        >
          {pendente ? 'Gerando…' : ativo ? 'Gerar outro link' : 'Gerar link'}
        </button>
      </div>
      {ativo ? (
        <form action={revogarLinkSindico}>
          <input type="hidden" name="visita_id" value={visitaId} />
          <div className="acoes">
            <BotaoSubmit secundario pendenteTexto="Revogando…">
              Revogar link
            </BotaoSubmit>
          </div>
        </form>
      ) : null}
    </div>
  )
}
