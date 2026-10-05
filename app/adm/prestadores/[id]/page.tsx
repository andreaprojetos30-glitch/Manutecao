import { alternarPrestador, dispensarSenhaPrestador, salvarPrestador } from '@/app/adm/acoes'
import { Avisos } from '@/app/adm/componentes/Avisos'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Painel } from '@/app/adm/componentes/Painel'
import { FormPrestador } from '@/app/adm/prestadores/FormPrestador'
import { lerPrestador } from '@/lib/consultas-cadastro'
import { lerSenhaInicial } from '@/lib/prestador-login'

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

  const senhaInicial = await lerSenhaInicial(prestador.id)

  return (
    <Painel atual="prestadores">
      <div className="topo">
        <h1>{prestador.nome}</h1>
        <span className={prestador.ativo ? 'selo' : 'selo selo-inativo'}>{prestador.ativo ? 'Ativo' : 'Inativo'}</span>
      </div>
      <p className="nota">{prestador.usuario_id ? 'Acesso ao aplicativo: Sim' : 'Acesso ao aplicativo: Não'}</p>
      <Avisos erro={query.erro} salvo={query.salvo} />
      {senhaInicial ? (
        <div className="ok" role="status">
          <p>
            Senha inicial do aplicativo: <strong className="senha-inicial">{senhaInicial}</strong>
          </p>
          <p>Anote e passe ao prestador. Esta senha não fica guardada na ficha.</p>
          <form action={dispensarSenhaPrestador}>
            <input type="hidden" name="id" value={prestador.id} />
            <BotaoSubmit secundario pendenteTexto="Ok…">
              Já anotei
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
