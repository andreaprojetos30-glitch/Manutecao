export function Lista({
  itens,
  vazio,
}: {
  itens: { chave: string; href: string; titulo: string; meta: string; ativo: boolean; selo?: string }[]
  vazio: string
}) {
  if (itens.length === 0) return <p className="vazio">{vazio}</p>
  return (
    <ul className="lista">
      {itens.map((item) => (
        <li key={item.chave}>
          <a href={item.href}>
            <strong>{item.titulo}</strong>
            <span className="meta">{item.meta}</span>
            <span className={item.ativo ? 'selo' : 'selo selo-inativo'}>
              {item.selo ?? (item.ativo ? 'Ativo' : 'Inativo')}
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}
