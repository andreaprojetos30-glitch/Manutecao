import { Moldura } from '@/app/componentes/Moldura'
import { Sair } from '@/app/componentes/Sair'

const itens = [
  { id: 'condominios', href: '/adm/condominios', rotulo: 'Condomínios' },
  { id: 'sindicos', href: '/adm/sindicos', rotulo: 'Síndicos' },
  { id: 'prestadores', href: '/adm/prestadores', rotulo: 'Prestadores' },
  { id: 'equipamentos', href: '/adm/equipamentos', rotulo: 'Equipamentos' },
] as const

export type Secao = 'inicio' | (typeof itens)[number]['id']

export function Painel({ atual, children }: { atual: Secao; children: React.ReactNode }) {
  return (
    <Moldura largo>
      <div className="painel">
        {atual === 'inicio' ? null : (
          <nav className="atalhos" aria-label="Cadastros">
            <a href="/adm">Início</a>
            {itens.map((item) => (
              <a key={item.id} href={item.href} aria-current={item.id === atual ? 'page' : undefined}>
                {item.rotulo}
              </a>
            ))}
          </nav>
        )}
        {children}
        <Sair />
      </div>
    </Moldura>
  )
}
