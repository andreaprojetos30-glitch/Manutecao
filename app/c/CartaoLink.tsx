import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Moldura } from '@/app/componentes/Moldura'
import { dataHumana } from '@/lib/cadastros'
import { dataHoraHumana } from '@/lib/manutencoes'
import { confirmarRealizacao } from '@/app/c/[token]/acoes'

export function CartaoIndisponivel() {
  return (
    <Moldura>
      <section className="cartao confirmacao">
        <h1>ELEVA</h1>
        <p className="aviso">Este link não está disponível.</p>
      </section>
    </Moldura>
  )
}

export function CartaoConfirmacao({
  token,
  condominio,
  titulo,
  dataEfetiva,
  confirmadoEm,
  avisoSindico,
}: {
  token: string
  condominio: string
  titulo: string
  dataEfetiva: string
  confirmadoEm: string | null
  avisoSindico: boolean
}) {
  const pdf = `/c/${token}/pdf`
  const quando = confirmadoEm ? dataHoraHumana(confirmadoEm) : ''

  return (
    <Moldura>
      <section className="cartao confirmacao">
        <p className="marca">ELEVA</p>
        <h1>{titulo}</h1>
        <p className="subtitulo">{condominio}</p>
        <dl className="ficha">
          <div>
            <dt>Data efetiva</dt>
            <dd>{dataHumana(dataEfetiva)}</dd>
          </div>
        </dl>
        <a className="leitura-pdf" href={pdf}>
          <object data={pdf} type="application/pdf" aria-label="Comprovante da manutenção">
            Abrir o comprovante
          </object>
        </a>
        {confirmadoEm ? (
          <p className="ok" role="status">
            Confirmação recebida pelo link{quando ? ` em ${quando}` : ''}. Este registro não autentica a identidade de quem clicou.
          </p>
        ) : (
          <>
            <p className="nota">
              A confirmação registra o recebimento pelo link e não autentica a identidade de quem clicou.
            </p>
            {avisoSindico ? (
              <p className="aviso" role="alert">
                A confirmação não foi registrada. A ELEVA precisa atualizar o síndico deste condomínio.
              </p>
            ) : null}
            <form action={confirmarRealizacao}>
              <input type="hidden" name="token" value={token} />
              <BotaoSubmit pendenteTexto="Confirmando…">Confirmar realização da manutenção</BotaoSubmit>
            </form>
          </>
        )}
      </section>
    </Moldura>
  )
}
