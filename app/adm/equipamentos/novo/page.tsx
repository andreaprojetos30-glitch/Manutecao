import { salvarEquipamento } from '@/app/adm/acoes'
import { FormEquipamento } from '@/app/adm/equipamentos/FormEquipamento'
import { Painel } from '@/app/adm/componentes/Painel'
import { exigirDestino } from '@/lib/sessao'

export const metadata = { title: 'Novo equipamento · ELEVA Manutenção' }

export default async function NovoEquipamentoPage() {
  await exigirDestino('/adm')

  return (
    <Painel atual="equipamentos">
      <h1>Novo equipamento</h1>
      <FormEquipamento
        action={salvarEquipamento}
        cancelar="/adm/equipamentos"
        inicial={{ nome: '' }}
      />
    </Painel>
  )
}
