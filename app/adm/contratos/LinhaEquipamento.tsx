export function LinhaEquipamento({ nome, identificacao }: { nome: string; identificacao: string | null }) {
  return (
    <div className="unidade">
      <strong>{nome}</strong>
      {identificacao ? <span className="meta">{identificacao}</span> : null}
    </div>
  )
}
