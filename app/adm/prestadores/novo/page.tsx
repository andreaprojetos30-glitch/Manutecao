import { salvarPrestador } from '@/app/adm/acoes'
import { Painel } from '@/app/adm/componentes/Painel'
import { FormPrestador } from '@/app/adm/prestadores/FormPrestador'
import { opcoesAcesso } from '@/lib/consultas-cadastro'

export const metadata = { title: 'Novo prestador · ELEVA Manutenção' }

export default async function NovoPrestadorPage() {
  const acessos = await opcoesAcesso()

  return (
    <Painel atual="prestadores">
      <h1>Novo prestador</h1>
      <FormPrestador
        action={salvarPrestador}
        acessos={acessos}
        cancelar="/adm/prestadores"
        inicial={{ nome: '', whatsapp: '', email: '', usuarioId: '', observacoes: '' }}
      />
    </Painel>
  )
}
