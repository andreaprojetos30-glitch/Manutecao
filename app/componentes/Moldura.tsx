export function Moldura({
  children,
  largo = false,
  campo = false,
}: {
  children: React.ReactNode
  largo?: boolean
  campo?: boolean
}) {
  const classe = campo ? 'pagina pagina-campo' : largo ? 'pagina pagina-painel' : 'pagina'
  return (
    <div className="app">
      <header className="faixa">
        <img src="/logo-eleva.png" alt="ELEVA Fitness" />
        <p className="faixa-rotulo">Manutenção</p>
      </header>
      <main className={classe}>{children}</main>
    </div>
  )
}
