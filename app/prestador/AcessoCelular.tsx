import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { bloquearCelular, encerrarCelular } from '@/app/prestador/acesso'

export function AcessoCelular() {
  return (
    <div className="sair">
      <form action={bloquearCelular}>
        <BotaoSubmit secundario pendenteTexto="Bloqueando…">
          Bloquear
        </BotaoSubmit>
      </form>
      <form action={encerrarCelular}>
        <label className="confirma">
          <input name="confirmar" type="checkbox" value="sim" required />
          Encerrar o acesso neste celular. A ELEVA precisará enviar um novo link.
        </label>
        <BotaoSubmit secundario pendenteTexto="Encerrando…">
          Encerrar neste celular
        </BotaoSubmit>
      </form>
    </div>
  )
}
