export function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <header className="faixa">
        <img src="/logo-eleva.png" alt="ELEVA Fitness" />
        <p className="faixa-rotulo">Manutenção</p>
      </header>
      <main className="pagina">{children}</main>
    </div>
  )
}
