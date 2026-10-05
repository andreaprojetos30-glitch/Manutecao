import { Painel } from '@/app/adm/componentes/Painel'
import { salvarContrato } from '@/app/adm/contratos/acoes'
import { FormContrato } from '@/app/adm/contratos/FormContrato'
import { Orientacao, Passos } from '@/app/adm/contratos/Passos'
import { idValido } from '@/lib/cadastros'
import { opcoesCondominio, opcoesPrestador } from '@/lib/consultas-contrato'
import { orientacaoContrato } from '@/lib/contratos'

export const metadata = { title: 'Novo contrato · ELEVA Manutenção' }

export default async function NovoContratoPage({
  searchParams,
}: {
  searchParams: Promise<{ condominio?: string }>
}) {
  const params = await searchParams
  const condominios = await opcoesCondominio()
  const prestadores = await opcoesPrestador(null)
  const condominioInicial = idValido(params.condominio ?? '') && condominios.some((item) => item.id === params.condominio) ? params.condominio ?? '' : ''
  const guia = orientacaoContrato('contrato', 0, false, false)

  return (
    <Painel atual="contratos">
      <Passos atual="contrato" contratoId={null} equipamentos={0} gerada={false} />
      <h1>Novo contrato</h1>
      <Orientacao texto={guia.texto} />
      {condominios.length === 0 ? (
        <>
          <p className="vazio">Cadastre um condomínio antes de criar o contrato.</p>
          <div className="acoes">
            <a className="botao" href="/adm/condominios/novo">
              Novo condomínio
            </a>
          </div>
        </>
      ) : (
        <FormContrato
          action={salvarContrato}
          cancelar="/adm/contratos"
          condominios={condominios}
          prestadores={prestadores}
          inicial={{
            condominioId: condominioInicial,
            dataInicioContrato: '',
            dataInicioManutencao: '',
            quantidadeVisitas: '',
            prestadorId: '',
            status: 'ativo',
            bloqueado: false,
          }}
        />
      )}
    </Painel>
  )
}
