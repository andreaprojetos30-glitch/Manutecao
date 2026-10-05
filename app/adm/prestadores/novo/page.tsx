import { salvarPrestador } from '@/app/adm/acoes'
import { Painel } from '@/app/adm/componentes/Painel'
import { FormPrestador } from '@/app/adm/prestadores/FormPrestador'

export const metadata = { title: 'Novo prestador · ELEVA Manutenção' }

export default async function NovoPrestadorPage() {
  return (
    <Painel atual="prestadores">
      <h1>Novo prestador</h1>
      <FormPrestador
        action={salvarPrestador}
        cancelar="/adm/prestadores"
        inicial={{ nome: '', whatsapp: '', email: '', acesso: 'nao', observacoes: '' }}
      />
    </Painel>
  )
}
