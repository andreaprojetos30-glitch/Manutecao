import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Moldura } from '@/app/componentes/Moldura'
import { dataHumana } from '@/lib/cadastros'
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

export function CartaoEncerrado() {
  return (
    <Moldura>
      <section className="cartao confirmacao">
        <h1>ELEVA</h1>
        <p className="aviso">Esta confirmação já foi registrada. O link está encerrado.</p>
      </section>
    </Moldura>
  )
}

export function CartaoPronto({ token }: { token: string }) {
  return (
    <Moldura>
      <section className="cartao confirmacao">
        <p className="marca">ELEVA</p>
        <h1>Confirmação registrada</h1>
        <p className="ok" role="status">
          Confirmação recebida pelo link. Este registro não autentica a identidade de quem clicou.
        </p>
        <a className="baixar" href={`/c/${token}/pdf`}>
          Baixar meu comprovante
        </a>
      </section>
    </Moldura>
  )
}

export function CartaoConfirmacao({
  token,
  condominio,
  titulo,
  dataEfetiva,
  avisoSindico,
}: {
  token: string
  condominio: string
  titulo: string
  dataEfetiva: string
  avisoSindico: boolean
}) {
  const pdf = `/c/${token}/pdf`

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
        <p className="nota">
          A confirmação registra o recebimento pelo link e não autentica a identidade de quem clicou.
        </p>
        {avisoSindico ? (
          <p className="aviso" role="alert">
            A confirmação não foi registrada. A ELEVA precisa indicar quem recebe os comprovantes deste condomínio.
          </p>
        ) : null}
        <form action={confirmarRealizacao}>
          <input type="hidden" name="token" value={token} />
          <BotaoSubmit pendenteTexto="Confirmando…">Confirmar manutenção e baixar PDF</BotaoSubmit>
        </form>
      </section>
    </Moldura>
  )
}
