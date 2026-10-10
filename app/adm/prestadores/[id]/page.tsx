import { alternarPrestador, dispensarAtivacao, salvarPrestador, solicitarNovaAtivacao } from '@/app/adm/acoes'
import { Avisos } from '@/app/adm/componentes/Avisos'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Painel } from '@/app/adm/componentes/Painel'
import { FormPrestador } from '@/app/adm/prestadores/FormPrestador'
import { CopiarLink } from '@/app/adm/prestadores/CopiarLink'
import { lerPrestador } from '@/lib/consultas-cadastro'
import { linkAtivacao, textoSituacaoAcesso } from '@/lib/desbloqueio'
import { lerAtivacao, lerSituacaoAcesso } from '@/lib/prestador-login'
import { headers } from 'next/headers'

export const metadata = { title: 'Prestador · ELEVA Manutenção' }

export default async function PrestadorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string; salvo?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const prestador = await lerPrestador(id)

  if (!prestador) {
    return (
      <Painel atual="prestadores">
        <h1>Prestador</h1>
        <p className="vazio">Prestador não encontrado.</p>
        <div className="acoes">
          <a className="botao botao-secundario" href="/adm/prestadores">
            Voltar
          </a>
        </div>
      </Painel>
    )
  }

  const token = await lerAtivacao(prestador.id)
  const cabecalho = await headers()
  const host = cabecalho.get('x-forwarded-host') ?? cabecalho.get('host') ?? ''
  const proto = cabecalho.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  const link = token ? linkAtivacao(host ? `${proto}://${host}` : '', token) : null
  const situacao = textoSituacaoAcesso(await lerSituacaoAcesso(prestador.id, Boolean(prestador.usuario_id)))

  return (
    <Painel atual="prestadores">
      <div className="topo">
        <h1>{prestador.nome}</h1>
        <span className={prestador.ativo ? 'selo' : 'selo selo-inativo'}>{prestador.ativo ? 'Ativo' : 'Inativo'}</span>
      </div>
      <p className="nota">{situacao}</p>
      <Avisos erro={query.erro} salvo={query.salvo} />
      {link ? (
        <div className="ok" role="status">
          <p>Envie este link no WhatsApp do prestador. Ele abre no celular, ativa o acesso e escolhe o PIN.</p>
          <p>A ELEVA não vê o PIN. O link vale 72 horas e só funciona uma vez.</p>
          <input className="link-ativacao" readOnly value={link} aria-label="Link de ativação" />
          <CopiarLink url={link} />
          <form action={dispensarAtivacao}>
            <input type="hidden" name="id" value={prestador.id} />
            <BotaoSubmit secundario pendenteTexto="Ok…">
              Já enviei
            </BotaoSubmit>
          </form>
        </div>
      ) : null}
      <FormPrestador
        action={salvarPrestador}
        cancelar="/adm/prestadores"
        inicial={{
          id: prestador.id,
          nome: prestador.nome,
          whatsapp: prestador.whatsapp,
          email: prestador.email ?? '',
          acesso: prestador.usuario_id ? 'sim' : 'nao',
          observacoes: prestador.observacoes ?? '',
        }}
      />
      {prestador.usuario_id ? (
        <form action={solicitarNovaAtivacao}>
          <input type="hidden" name="id" value={prestador.id} />
          <label className="confirma">
            <input name="confirmar" type="checkbox" value="sim" required />
            O celular atual perde o acesso e o PIN deixa de valer. Um novo link será gerado.
          </label>
          <div className="acoes">
            <BotaoSubmit secundario pendenteTexto="Gerando…">
              Pedir nova ativação
            </BotaoSubmit>
          </div>
        </form>
      ) : null}
      <form action={alternarPrestador}>
        <input type="hidden" name="id" value={prestador.id} />
        <input type="hidden" name="ativo" value={prestador.ativo ? 'false' : 'true'} />
        <div className="acoes">
          <BotaoSubmit secundario>{prestador.ativo ? 'Inativar' : 'Reativar'}</BotaoSubmit>
        </div>
      </form>
    </Painel>
  )
}
