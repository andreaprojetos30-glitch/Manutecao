import { Painel } from '@/app/adm/componentes/Painel'
import { criarManutencaoAvulsa } from '@/app/adm/manutencoes/acoes'
import { FormAvulsa } from '@/app/adm/manutencoes/FormAvulsa'
import { matrizAtiva, opcoesCondominio, opcoesPrestador } from '@/lib/consultas-contrato'

export const metadata = { title: 'Nova manutenção avulsa · ELEVA Manutenção' }

export default async function NovaAvulsaPage() {
  const [condominios, prestadores, matriz] = await Promise.all([opcoesCondominio(), opcoesPrestador(null), matrizAtiva()])
  const condominiosAtivos = condominios.filter((item) => item.ativo)
  const prestadoresAtivos = prestadores.filter((item) => item.ativo)

  return (
    <Painel atual="manutencoes" extenso>
      <h1>Nova manutenção avulsa</h1>
      <p className="nota">Não usa contrato mensal e não altera as visitas preventivas já geradas.</p>
      {condominiosAtivos.length === 0 ? <p className="vazio">Cadastre um condomínio ativo antes de criar a manutenção.</p> : null}
      {prestadoresAtivos.length === 0 ? <p className="vazio">Cadastre um prestador ativo antes de criar a manutenção.</p> : null}
      {matriz.erro ? (
        <p className="aviso" role="alert">
          {matriz.erro}
        </p>
      ) : null}
      {!matriz.erro && matriz.linhas.length === 0 ? (
        <>
          <p className="vazio">Cadastre um equipamento na lista-base antes de incluí-lo nesta manutenção.</p>
          <div className="acoes">
            <a className="botao" href="/adm/equipamentos/novo">
              Novo equipamento
            </a>
          </div>
        </>
      ) : null}
      {condominiosAtivos.length > 0 && prestadoresAtivos.length > 0 && matriz.linhas.length > 0 ? (
        <FormAvulsa
          action={criarManutencaoAvulsa}
          condominios={condominiosAtivos.map((item) => ({ id: item.id, nome: item.nome }))}
          prestadores={prestadoresAtivos.map((item) => ({ id: item.id, nome: item.nome }))}
          equipamentos={matriz.linhas.map((item) => ({ id: item.id, nome: item.nome }))}
        />
      ) : null}
    </Painel>
  )
}
