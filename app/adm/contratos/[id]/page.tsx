import { Avisos } from '@/app/adm/componentes/Avisos'
import { Painel } from '@/app/adm/componentes/Painel'
import { salvarContrato } from '@/app/adm/contratos/acoes'
import { FormContrato } from '@/app/adm/contratos/FormContrato'
import { ContratoNaoEncontrado, Orientacao, Passos } from '@/app/adm/contratos/Passos'
import { ResumoVisitas } from '@/app/adm/contratos/ResumoVisitas'
import { equipamentosDoContrato, lerContrato, opcoesCondominio, opcoesPrestador, visitasDoContrato } from '@/lib/consultas-contrato'
import { caminhoEtapa, orientacaoContrato, resumoContrato, rotuloContrato } from '@/lib/contratos'

export const metadata = { title: 'Contrato · ELEVA Manutenção' }

export default async function ContratoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string; salvo?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const contrato = await lerContrato(id)
  if (!contrato) return <ContratoNaoEncontrado />

  const [equipamentos, condominios, prestadores, visitas] = await Promise.all([
    equipamentosDoContrato(contrato.id),
    opcoesCondominio(),
    opcoesPrestador(contrato.prestador_padrao_id),
    visitasDoContrato(contrato.id),
  ])
  const resumo =
    visitas.erro && contrato.programacao_gerada
      ? null
      : resumoContrato({
          total: contrato.quantidade_visitas,
          anteriores: contrato.visitas_anteriores,
          inicioManutencao: contrato.data_inicio_manutencao.slice(0, 10),
          gerada: contrato.programacao_gerada,
          visitas: visitas.linhas,
        })
  const quantidadeEquipamentos = equipamentos.linhas.length
  const guia = orientacaoContrato('contrato', quantidadeEquipamentos, contrato.programacao_gerada)
  const href = guia.destino ? caminhoEtapa(contrato.id, guia.destino) : undefined
  const condominiosForm = condominios.some((item) => item.id === contrato.condominio_id)
    ? condominios
    : [{ id: contrato.condominio_id, nome: contrato.condominio_nome, ativo: true }, ...condominios]

  return (
    <Painel atual="contratos">
      <Passos atual="contrato" contratoId={contrato.id} equipamentos={quantidadeEquipamentos} gerada={contrato.programacao_gerada} />
      <h1>{rotuloContrato(contrato.numero_contrato)}</h1>
      <p className="subtitulo">{contrato.condominio_nome}</p>
      <Orientacao texto={guia.texto} href={href} rotulo={guia.rotulo ?? undefined} />
      <Avisos erro={query.erro} salvo={query.salvo} />
      {resumo ? <ResumoVisitas resumo={resumo} /> : null}
      {visitas.erro && contrato.programacao_gerada ? (
        <p className="aviso" role="alert">
          {visitas.erro}
        </p>
      ) : null}
      <FormContrato
        action={salvarContrato}
        cancelar="/adm/contratos"
        condominios={condominiosForm}
        prestadores={prestadores}
        inicial={{
          id: contrato.id,
          condominioId: contrato.condominio_id,
          dataInicioContrato: contrato.data_inicio_contrato.slice(0, 10),
          dataInicioManutencao: contrato.data_inicio_manutencao.slice(0, 10),
          quantidadeVisitas: String(contrato.quantidade_visitas),
          visitasAnteriores: String(contrato.visitas_anteriores),
          prestadorId: contrato.prestador_padrao_id ?? '',
          status: contrato.status,
          bloqueado: contrato.programacao_gerada,
        }}
      />
    </Painel>
  )
}
