import { alternarSindico, corrigirSindico } from '@/app/adm/acoes'
import { Avisos } from '@/app/adm/componentes/Avisos'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Painel } from '@/app/adm/componentes/Painel'
import { FormSindicoCorrecao } from '@/app/adm/condominios/FormSindico'
import { periodoSindico } from '@/lib/cadastros'
import { lerSindico } from '@/lib/consultas-cadastro'

export const metadata = { title: 'Síndico · ELEVA Manutenção' }

export default async function SindicoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; sindicoId: string }>
  searchParams: Promise<{ erro?: string; salvo?: string }>
}) {
  const { id, sindicoId } = await params
  const query = await searchParams
  const sindico = await lerSindico(id, sindicoId)

  if (!sindico) {
    return (
      <Painel atual="sindicos">
        <h1>Síndico</h1>
        <p className="vazio">Síndico não encontrado.</p>
        <div className="acoes">
          <a className="botao botao-secundario" href="/adm/sindicos">
            Voltar
          </a>
        </div>
      </Painel>
    )
  }

  const voltar = `/adm/condominios/${id}#sindicos`

  return (
    <Painel atual="sindicos">
      <h1>{sindico.nome}</h1>
      <p className="subtitulo">{sindico.condominio_nome}</p>
      <Avisos erro={query.erro} salvo={query.salvo} />
      <FormSindicoCorrecao
        action={corrigirSindico}
        cancelar={voltar}
        inicial={{
          id: sindico.id,
          condominioId: sindico.condominio_id,
          nome: sindico.nome,
          whatsapp: sindico.whatsapp ?? '',
          email: sindico.email ?? '',
          dataInicio: sindico.data_inicio ?? '',
          dataFim: sindico.data_fim ?? '',
          ativo: sindico.ativo,
          periodo: periodoSindico(sindico.data_inicio, sindico.data_fim, sindico.ativo),
        }}
      />
      {sindico.ativo ? (
        <form action={alternarSindico}>
          <input type="hidden" name="id" value={sindico.id} />
          <input type="hidden" name="condominio_id" value={sindico.condominio_id} />
          <div className="acoes">
            <BotaoSubmit secundario>Inativar</BotaoSubmit>
          </div>
        </form>
      ) : null}
    </Painel>
  )
}
