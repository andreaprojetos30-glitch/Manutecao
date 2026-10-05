import { sair } from '@/app/acoes'

export function Sair() {
  return (
    <form action={sair} className="sair">
      <button className="botao-secundario" type="submit">
        Sair
      </button>
    </form>
  )
}
