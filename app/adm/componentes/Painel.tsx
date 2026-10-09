import { Moldura } from '@/app/componentes/Moldura'
import { Sair } from '@/app/componentes/Sair'

const itens = [
  { id: 'condominios', href: '/adm/condominios', rotulo: 'Condomínios' },
  { id: 'sindicos', href: '/adm/sindicos', rotulo: 'Síndicos' },
  { id: 'contratos', href: '/adm/contratos', rotulo: 'Contratos' },
  { id: 'manutencoes', href: '/adm/manutencoes', rotulo: 'Manutenções' },
  { id: 'prestadores', href: '/adm/prestadores', rotulo: 'Prestadores' },
  { id: 'equipamentos', href: '/adm/equipamentos', rotulo: 'Equipamentos' },
] as const

export type Secao = 'inicio' | (typeof itens)[number]['id']

export function Painel({ atual, extenso = false, children }: { atual: Secao; extenso?: boolean; children: React.ReactNode }) {
  return (
    <Moldura largo>
      <div className={extenso ? 'painel painel-extenso' : 'painel'}>
        {atual === 'inicio' ? null : (
          <nav className="atalhos" aria-label="Áreas">
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
