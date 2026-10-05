import { sair } from '@/app/acoes'

export function Sair() {
  return (
    <form action={sair} className="sair">
      <button type="submit">Sair</button>
    </form>
  )
}
