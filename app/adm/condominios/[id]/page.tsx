import { alternarCondominio, alternarSindico, registrarSindico, salvarCondominio } from '@/app/adm/acoes'
import { Avisos } from '@/app/adm/componentes/Avisos'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Painel } from '@/app/adm/componentes/Painel'
import { FormCondominio } from '@/app/adm/condominios/FormCondominio'
import { FormSindicoNovo } from '@/app/adm/condominios/FormSindico'
import { hojeIso, periodoSindico, dataHumana } from '@/lib/cadastros'
import { lerCondominio, sindicosDoCondominio } from '@/lib/consultas-cadastro'
import { contratosDoCondominio } from '@/lib/consultas-contrato'
import { rotuloContrato, rotuloStatusContrato, textoVisitas } from '@/lib/contratos'

export const metadata = { title: 'Condomínio · ELEVA Manutenção' }

export default async function CondominioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string; salvo?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const condominio = await lerCondominio(id)

  if (!condominio) {
    return (
      <Painel atual="condominios">
        <h1>Condomínio</h1>
        <p className="vazio">Condomínio não encontrado.</p>
        <div className="acoes">
          <a className="botao botao-secundario" href="/adm/condominios">
            Voltar
          </a>
        </div>
      </Painel>
    )
  }

  const [sindicos, contratos] = await Promise.all([sindicosDoCondominio(condominio.id), contratosDoCondominio(condominio.id)])

  return (
    <Painel atual="condominios">
      <div className="topo">
        <h1>{condominio.nome}</h1>
        <span className={condominio.ativo ? 'selo' : 'selo selo-inativo'}>{condominio.ativo ? 'Ativo' : 'Inativo'}</span>
      </div>
      <Avisos erro={query.erro} salvo={query.salvo} />
      <FormCondominio
        action={salvarCondominio}
        cancelar="/adm/condominios"
        inicial={{
          id: condominio.id,
          nome: condominio.nome,
          cep: condominio.cep ?? '',
          endereco: condominio.endereco,
          numero: condominio.numero ?? '',
          complemento: condominio.complemento ?? '',
          bairro: condominio.bairro,
          cidade: condominio.cidade,
          estado: condominio.estado,
          quantidadeUnidades: condominio.quantidade_unidades == null ? '' : String(condominio.quantidade_unidades),
          observacoes: condominio.observacoes ?? '',
        }}
      />
      <form action={alternarCondominio}>
        <input type="hidden" name="id" value={condominio.id} />
        <input type="hidden" name="ativo" value={condominio.ativo ? 'false' : 'true'} />
        <div className="acoes">
          <BotaoSubmit secundario>{condominio.ativo ? 'Inativar' : 'Reativar'}</BotaoSubmit>
        </div>
      </form>

      <section className="bloco" id="contratos">
        <h2>Contratos</h2>
        {contratos.erro ? (
          <p className="aviso" role="alert">
            {contratos.erro}
          </p>
        ) : null}
        {contratos.linhas.length === 0 ? <p className="vazio">Nenhum contrato deste condomínio.</p> : null}
        <ul className="historico">
          {contratos.linhas.map((contrato) => (
            <li key={contrato.id}>
              <div>
                <strong>{rotuloContrato(contrato.numero_contrato)}</strong>
                <span className="meta">
                  {textoVisitas(contrato.quantidade_visitas)} · manutenção {dataHumana(contrato.data_inicio_manutencao)}
                </span>
              </div>
              <span className={contrato.status === 'ativo' ? 'selo' : 'selo selo-inativo'}>{rotuloStatusContrato(contrato.status)}</span>
              <div className="acoes">
                <a className="botao botao-secundario" href={`/adm/contratos/${contrato.id}`}>
                  Abrir
                </a>
              </div>
            </li>
          ))}
        </ul>
        <div className="acoes">
          <a className="botao" href={`/adm/contratos/novo?condominio=${condominio.id}`}>
            Novo contrato
          </a>
        </div>
      </section>

      <section className="bloco" id="sindicos">
        <h2>Síndicos</h2>
        <p className="nota">
          Um novo período não altera o anterior. Se a mesma pessoa voltar, registre um novo síndico.
        </p>
        {sindicos.length === 0 ? <p className="vazio">Nenhum síndico registrado.</p> : null}
        <ul className="historico">
          {sindicos.map((sindico) => (
            <li key={sindico.id}>
              <div>
                <strong>{sindico.nome}</strong>
                <span className="meta">
                  {periodoSindico(sindico.data_inicio, sindico.data_fim, sindico.ativo)}
                  {sindico.whatsapp ? ` · ${sindico.whatsapp}` : ''}
                  {sindico.email ? ` · ${sindico.email}` : ''}
                </span>
              </div>
              <span className={sindico.ativo ? 'selo' : 'selo selo-inativo'}>{sindico.ativo ? 'Ativo' : 'Histórico'}</span>
              <div className="acoes">
                <a className="botao botao-secundario" href={`/adm/condominios/${condominio.id}/sindicos/${sindico.id}`}>
                  Editar
                </a>
                {sindico.ativo ? (
                  <form action={alternarSindico}>
                    <input type="hidden" name="id" value={sindico.id} />
                    <input type="hidden" name="condominio_id" value={condominio.id} />
                    <BotaoSubmit secundario>Inativar</BotaoSubmit>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <h2>Registrar novo síndico</h2>
        <FormSindicoNovo action={registrarSindico} condominioId={condominio.id} dataInicio={hojeIso()} />
      </section>
    </Painel>
  )
}
