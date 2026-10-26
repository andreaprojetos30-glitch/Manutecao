import { alternarCondominio, alternarSindico, indicarDestinatario, registrarSindico, salvarCondominio, voltarDestinatarioAoSindico } from '@/app/adm/acoes'
import { Avisos } from '@/app/adm/componentes/Avisos'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Painel } from '@/app/adm/componentes/Painel'
import { FormCondominio } from '@/app/adm/condominios/FormCondominio'
import { FormDestinatario } from '@/app/adm/condominios/FormDestinatario'
import { FormSindicoNovo } from '@/app/adm/condominios/FormSindico'
import { hojeIso, periodoSindico, dataHumana } from '@/lib/cadastros'
import { destinatariosDoCondominio, lerCondominio, sindicosDoCondominio } from '@/lib/consultas-cadastro'
import { rotuloPapelDestinatario } from '@/lib/destinatario-comprovante'
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

  const [sindicos, contratos, destinatarios] = await Promise.all([
    sindicosDoCondominio(condominio.id),
    contratosDoCondominio(condominio.id),
    destinatariosDoCondominio(condominio.id),
  ])
  const sindicoAtivo = sindicos.find((sindico) => sindico.ativo) ?? null

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

      <section className="bloco" id="destinatario">
        <h2>Recebimento dos comprovantes</h2>
        <p className="nota">
          Há um destinatário ativo por condomínio. Sem indicação, os comprovantes vão para o síndico ativo. A troca
          invalida só os links ainda sem confirmação deste condomínio.
        </p>
        {destinatarios.estado === 'indisponivel' ? (
          <p className="nota">O cadastro de quem recebe os comprovantes ainda não está disponível neste ambiente.</p>
        ) : (
          <>
            <p>
              {destinatarios.ativo ? (
                <>
                  Quem recebe agora: <strong>{destinatarios.ativo.nome}</strong>,{' '}
                  {rotuloPapelDestinatario(destinatarios.ativo.papel, destinatarios.ativo.complemento)}.
                </>
              ) : sindicoAtivo ? (
                <>
                  Quem recebe agora: <strong>{sindicoAtivo.nome}</strong>, síndico.
                </>
              ) : (
                <>Nenhum síndico ativo. Indique um responsável para liberar novos links.</>
              )}
            </p>
            {destinatarios.linhas.length === 0 ? <p className="vazio">Nenhuma indicação registrada.</p> : null}
            <ul className="historico">
              {destinatarios.linhas.map((linha) => (
                <li key={linha.id}>
                  <div>
                    <strong>{linha.nome}</strong>
                    <span className="meta">
                      {rotuloPapelDestinatario(linha.papel, linha.complemento)}
                      {' · '}
                      {periodoSindico(linha.data_inicio, linha.data_fim, linha.ativo)}
                      {linha.whatsapp ? ` · ${linha.whatsapp}` : ''}
                      {linha.email ? ` · ${linha.email}` : ''}
                    </span>
                  </div>
                  <span className={linha.ativo ? 'selo' : 'selo selo-inativo'}>{linha.ativo ? 'Ativo' : 'Histórico'}</span>
                </li>
              ))}
            </ul>
            {destinatarios.ativo ? (
              <form action={voltarDestinatarioAoSindico}>
                <input type="hidden" name="condominio_id" value={condominio.id} />
                <div className="acoes">
                  <BotaoSubmit secundario>Voltar a usar o síndico</BotaoSubmit>
                </div>
              </form>
            ) : null}
            <h2>Indicar outro responsável</h2>
            <FormDestinatario action={indicarDestinatario} condominioId={condominio.id} dataInicio={hojeIso()} />
          </>
        )}
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
