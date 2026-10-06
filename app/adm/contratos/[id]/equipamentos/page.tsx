import { Avisos } from '@/app/adm/componentes/Avisos'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Painel } from '@/app/adm/componentes/Painel'
import { adicionarEquipamentosContrato, definirIdentificacao, removerEquipamentoContrato } from '@/app/adm/contratos/acoes'
import { SelecaoEquipamentos } from '@/app/adm/contratos/FormEquipamentoContrato'
import { FormIdentificacao } from '@/app/adm/contratos/FormIdentificacao'
import { LinhaEquipamento } from '@/app/adm/contratos/LinhaEquipamento'
import { ContratoNaoEncontrado, Orientacao, Passos } from '@/app/adm/contratos/Passos'
import { idValido } from '@/lib/cadastros'
import { equipamentosDoContrato, lerContrato, matrizAtiva } from '@/lib/consultas-contrato'
import { caminhoEtapa, orientacaoContrato, rotuloComposicao, rotuloContrato } from '@/lib/contratos'

export const metadata = { title: 'Equipamentos do contrato · ELEVA Manutenção' }

export default async function EquipamentosContratoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; selecionar?: string; erro?: string; salvo?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const contrato = await lerContrato(id)
  if (!contrato) return <ContratoNaoEncontrado />

  const equipamentos = await equipamentosDoContrato(contrato.id)
  const selecionando = query.selecionar === '1'
  const editando = !selecionando && idValido(query.editar ?? '') ? equipamentos.linhas.find((item) => item.id === query.editar) ?? null : null
  const matriz = selecionando ? await matrizAtiva() : null
  const guia = orientacaoContrato('equipamentos', equipamentos.linhas.length, contrato.programacao_gerada)
  const href = guia.destino ? caminhoEtapa(contrato.id, guia.destino) : undefined
  const voltar = `/adm/contratos/${contrato.id}/equipamentos`

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

      {selecionando ? (
        <>
          <h2>Adicionar equipamentos</h2>
          <p className="nota">Marque os equipamentos ativos desta lista. A quantidade padrão é 1.</p>
          {matriz?.erro ? (
            <p className="aviso" role="alert">
              {matriz.erro}
            </p>
          ) : null}
          {matriz && matriz.linhas.length === 0 && !matriz.erro ? (
            <>
              <p className="vazio">Cadastre um equipamento na lista-base antes de incluí-lo neste contrato.</p>
              <div className="acoes">
                <a className="botao" href="/adm/equipamentos/novo">
                  Novo equipamento
                </a>
                <a className="botao botao-secundario" href={voltar}>
                  Cancelar
                </a>
              </div>
            </>
          ) : null}
          {matriz && matriz.linhas.length > 0 ? (
            <SelecaoEquipamentos
              action={adicionarEquipamentosContrato}
              contratoId={contrato.id}
              equipamentos={matriz.linhas.map((item) => ({ id: item.id, nome: item.nome }))}
              cancelar={voltar}
            />
          ) : null}
        </>
      ) : (
        <>
          <h2>{rotuloComposicao(equipamentos.linhas.length)}</h2>
          {equipamentos.linhas.length === 0 ? <p className="vazio">Nenhum equipamento neste contrato.</p> : null}
          <ul className="historico composicao">
            {equipamentos.linhas.map((item) => (
              <li key={item.id}>
                <LinhaEquipamento nome={item.matriz_nome} identificacao={item.identificacao} />
                <div className="acoes">
                  <a className="botao botao-secundario" href={`${voltar}?editar=${item.id}`}>
                    Editar identificação
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
          {editando ? (
            <>
              <h2>Identificação</h2>
              <FormIdentificacao
                key={editando.id}
                action={definirIdentificacao}
                contratoId={contrato.id}
                equipamentoId={editando.id}
                nome={editando.matriz_nome}
                identificacao={editando.identificacao ?? ''}
                cancelar={voltar}
              />
            </>
          ) : (
            <div className="acoes">
              <a className="botao" href={`${voltar}?selecionar=1`}>
                Adicionar equipamentos
              </a>
            </div>
          )}
        </>
      )}
    </Painel>
  )
}
