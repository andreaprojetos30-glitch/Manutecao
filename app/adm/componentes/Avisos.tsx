import { textoSalvo } from '@/lib/cadastros'

export function Avisos({ erro, salvo }: { erro?: string; salvo?: string }) {
  const confirmacao = textoSalvo(salvo)
  const falha = erro?.trim().slice(0, 200)
  return (
    <>
      {confirmacao ? (
        <p className="ok" role="status">
          {confirmacao}
        </p>
      ) : null}
      {falha ? (
        <p className="aviso" role="alert">
          {falha}
        </p>
      ) : null}
    </>
  )
}
