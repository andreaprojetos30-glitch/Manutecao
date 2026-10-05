import { alternarSindico, corrigirSindico } from '@/app/adm/acoes'
import { Avisos } from '@/app/adm/componentes/Avisos'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Painel } from '@/app/adm/componentes/Painel'
import { FormSindicoCorrecao } from '@/app/adm/condominios/FormSindico'
import { lerSindico, sindicosDoCondominio } from '@/lib/consultas-cadastro'

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

  const irmaos = await sindicosDoCondominio(id)
  const haAtivo = irmaos.some((item) => item.ativo)
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
        }}
      />
      {sindico.ativo || !haAtivo ? (
        <form action={alternarSindico}>
          <input type="hidden" name="id" value={sindico.id} />
          <input type="hidden" name="condominio_id" value={sindico.condominio_id} />
          <input type="hidden" name="ativo" value={sindico.ativo ? 'false' : 'true'} />
          <div className="acoes">
            <BotaoSubmit secundario>{sindico.ativo ? 'Inativar' : 'Reativar'}</BotaoSubmit>
          </div>
        </form>
      ) : (
        <p className="nota">Para colocar esta pessoa de novo, registre um novo síndico. O período anterior continua no histórico.</p>
      )}
    </Painel>
  )
}
