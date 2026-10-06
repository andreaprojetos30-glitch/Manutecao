import { Avisos } from '@/app/adm/componentes/Avisos'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Painel } from '@/app/adm/componentes/Painel'
import { removerEquipamentoContrato, salvarEquipamentoContrato } from '@/app/adm/contratos/acoes'
import { FormEquipamentoContrato } from '@/app/adm/contratos/FormEquipamentoContrato'
import { ContratoNaoEncontrado, Orientacao, Passos } from '@/app/adm/contratos/Passos'
import { idValido } from '@/lib/cadastros'
import { equipamentosDoContrato, lerContrato, opcoesMatriz } from '@/lib/consultas-contrato'
import { caminhoEtapa, orientacaoContrato, rotuloComposicao, rotuloContrato } from '@/lib/contratos'

export const metadata = { title: 'Equipamentos do contrato · ELEVA Manutenção' }

export default async function EquipamentosContratoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; erro?: string; salvo?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const contrato = await lerContrato(id)
  if (!contrato) return <ContratoNaoEncontrado />

  const equipamentos = await equipamentosDoContrato(contrato.id)
  const editando = idValido(query.editar ?? '') ? equipamentos.linhas.find((item) => item.id === query.editar) ?? null : null
  const matriz = await opcoesMatriz(editando?.equipamento_matriz_id ?? null)
  const guia = orientacaoContrato('equipamentos', equipamentos.linhas.length, contrato.programacao_gerada)
  const href = guia.destino ? caminhoEtapa(contrato.id, guia.destino) : undefined

  return (
    <Painel atual="contratos">
      <Passos atual="equipamentos" contratoId={contrato.id} equipamentos={equipamentos.linhas.length} gerada={contrato.programacao_gerada} />
      <h1>Equipamentos do contrato</h1>
      <p className="subtitulo">
        {rotuloContrato(contrato.numero_contrato)} · {contrato.condominio_nome}
      </p>
      <Orientacao texto={guia.texto} href={href} rotulo={guia.rotulo ?? undefined} />
      <Avisos erro={query.erro} salvo={query.salvo} />
      {equipamentos.erro ? (
        <p className="aviso" role="alert">
          {equipamentos.erro}
        </p>
      ) : null}

      <h2>{rotuloComposicao(equipamentos.linhas.length)}</h2>
      {equipamentos.linhas.length === 0 ? <p className="vazio">Nenhum equipamento neste contrato.</p> : null}
      <ul className="historico composicao">
        {equipamentos.linhas.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.nome_identificacao}</strong>
            </div>
            <div className="acoes">
              <a className="botao botao-secundario" href={`/adm/contratos/${contrato.id}/equipamentos?editar=${item.id}`}>
                Editar
              </a>
              <form action={removerEquipamentoContrato}>
                <input type="hidden" name="contrato_id" value={contrato.id} />
                <input type="hidden" name="id" value={item.id} />
                <BotaoSubmit secundario pendenteTexto="Retirando…">
                  Retirar
                </BotaoSubmit>
              </form>
            </div>
          </li>
        ))}
      </ul>

      <h2>{editando ? 'Editar equipamento' : 'Adicionar equipamento'}</h2>
      {matriz.length === 0 ? (
        <>
          <p className="vazio">Cadastre um equipamento na lista-base antes de incluí-lo neste contrato.</p>
          <div className="acoes">
            <a className="botao" href="/adm/equipamentos/novo">
              Novo equipamento
            </a>
          </div>
        </>
      ) : (
        <FormEquipamentoContrato
          key={editando?.id ?? 'novo'}
          action={salvarEquipamentoContrato}
          contratoId={contrato.id}
          equipamentos={matriz}
          contagens={equipamentos.contagens}
          cancelar={editando ? `/adm/contratos/${contrato.id}/equipamentos` : undefined}
          inicial={{
            id: editando?.id,
            matrizId: editando?.equipamento_matriz_id ?? '',
            nome: editando?.nome_identificacao ?? '',
          }}
        />
      )}
    </Painel>
  )
}
