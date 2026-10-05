import { salvarCondominio } from '@/app/adm/acoes'
import { Painel } from '@/app/adm/componentes/Painel'
import { FormCondominio } from '@/app/adm/condominios/FormCondominio'
import { exigirDestino } from '@/lib/sessao'

export const metadata = { title: 'Novo condomínio · ELEVA Manutenção' }

const vazio = {
  nome: '',
  cep: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  quantidadeUnidades: '',
  observacoes: '',
}

export default async function NovoCondominioPage() {
  await exigirDestino('/adm')

  return (
    <Painel atual="condominios">
      <h1>Novo condomínio</h1>
      <FormCondominio action={salvarCondominio} inicial={vazio} cancelar="/adm/condominios" />
    </Painel>
  )
}
