import { Avisos } from '@/app/adm/componentes/Avisos'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Moldura } from '@/app/componentes/Moldura'
import { finalizarManutencao, registrarOk } from '@/app/prestador/acoes'
import { dataHumana } from '@/lib/cadastros'
import { lerVisitaPrestador } from '@/lib/consultas-execucao'
import { assinarFoto } from '@/lib/fotos'
import { rotuloResultado, textoFaltam, textoProgresso, visitaEditavel } from '@/lib/execucao'
import { rotuloManutencao } from '@/lib/manutencoes'
import { rotuloStatusVisita } from '@/lib/contratos'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Manutenção · ELEVA Manutenção' }

export default async function VisitaPrestadorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string; salvo?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const resultado = await lerVisitaPrestador(id)

  if (!resultado.ativo) {
    return (
      <Moldura campo>
        <section className="campo">
          <h1>Manutenção</h1>
          <p className="aviso" role="alert">
            Seu acesso à execução está inativo. Procure a ELEVA.
          </p>
          <a className="botao" href="/prestador">
            Voltar
          </a>
        </section>
      </Moldura>
    )
  }

  const visita = resultado.visita
  if (!visita) {
    return (
      <Moldura campo>
        <section className="campo">
          <h1>Manutenção</h1>
          <p className="vazio">Manutenção não encontrada.</p>
          <a className="botao" href="/prestador">
            Voltar
          </a>
        </section>
      </Moldura>
    )
  }

  const titulo = rotuloManutencao(visita.tipo, visita.numero_visita, visita.quantidade_visitas)
  const editavel = visitaEditavel(visita.status)
  const faltam = textoFaltam(visita.equipamentos - visita.verificados)
  const supabase = await createClient()
  const fotos = await Promise.all(visita.itens.map((item) => assinarFoto(supabase, item.ocorrencia?.foto)))

  return (
    <Moldura campo>
      <section className="campo">
        <h1>{visita.condominio_nome}</h1>
        <p className="subtitulo">
          {titulo} — {dataHumana(visita.data_programada_atual)}
        </p>
        <p className="nota">{rotuloStatusVisita(visita.status)}</p>
        <Avisos erro={query.erro} salvo={query.salvo} />
        <p className="progresso">{textoProgresso(visita.verificados, visita.equipamentos)}</p>
        {!editavel ? <p className="nota">Esta manutenção está encerrada e fica disponível somente para consulta.</p> : null}

        <ul className="equipamentos">
          {visita.itens.map((item, indice) => (
            <li key={item.id}>
              <strong>{item.nome}</strong>
              <span className={`situacao situacao-${item.resultado}`}>{rotuloResultado(item.resultado, item.ocorrencia?.resolvida ?? null)}</span>
              {item.ocorrencia ? <p>{item.ocorrencia.descricao}</p> : null}
              {fotos[indice] ? <img className="foto-previa" src={fotos[indice]} alt={`Foto de ${item.nome}`} /> : null}
              {editavel ? (
                <div className="pares">
                  <form action={registrarOk}>
                    <input type="hidden" name="manutencao_id" value={visita.id} />
                    <input type="hidden" name="item_id" value={item.id} />
                    <BotaoSubmit pendenteTexto="Salvando…">OK</BotaoSubmit>
                  </form>
                  <a className="botao botao-secundario" href={`/prestador/manutencoes/${visita.id}/itens/${item.id}`}>
                    Ocorrência
                  </a>
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        {editavel ? (
          <form action={finalizarManutencao}>
            <h2>Finalizar manutenção</h2>
            {faltam ? <p className="alerta">{faltam}</p> : <p className="nota">Todos os equipamentos foram verificados.</p>}
            <label className="confirma">
              <input name="confirmar" type="checkbox" value="sim" required />
              Confirmo a finalização desta manutenção
            </label>
            <input type="hidden" name="id" value={visita.id} />
            <div className="acoes">
              <BotaoSubmit pendenteTexto="Finalizando…">Finalizar manutenção</BotaoSubmit>
            </div>
          </form>
        ) : null}

        <div className="acoes">
          <a className="botao botao-secundario" href="/prestador">
            Voltar
          </a>
        </div>
      </section>
    </Moldura>
  )
}
