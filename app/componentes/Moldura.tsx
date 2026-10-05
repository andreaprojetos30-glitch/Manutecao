export function Moldura({ children, largo = false }: { children: React.ReactNode; largo?: boolean }) {
  return (
    <div className="app">
      <header className="faixa">
        <img src="/logo-eleva.png" alt="ELEVA Fitness" />
        <p className="faixa-rotulo">Manutenção</p>
      </header>
      <main className={largo ? 'pagina pagina-painel' : 'pagina'}>{children}</main>
    </div>
  )
}
