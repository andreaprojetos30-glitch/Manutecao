import { dataHumana } from '@/lib/cadastros'
import {
  anoBiblioteca,
  categoriaBiblioteca,
  consultaDocumentos,
  listarVisitas,
  tituloVisita,
  type BibliotecaCondominio,
  type CategoriaBiblioteca,
} from '@/lib/biblioteca-documentos'
import { rotuloStatusVisita } from '@/lib/contratos'

const CATEGORIAS: Array<{ id: CategoriaBiblioteca; rotulo: string }> = [
  { id: 'manutencoes', rotulo: 'Manutenções' },
  { id: 'confirmacoes', rotulo: 'Confirmações' },
  { id: 'ocorrencias', rotulo: 'Ocorrências' },
]

export function AcessosCondominio({
  condominioId,
  biblioteca,
  anoPedido,
  categoriaPedida,
}: {
  condominioId: string
  biblioteca: { estado: 'ok'; biblioteca: BibliotecaCondominio } | { estado: 'indisponivel' }
  anoPedido?: string
  categoriaPedida?: string
}) {
  const ano = anoBiblioteca(anoPedido)
  const categoria = categoriaBiblioteca(categoriaPedida)
  const pronto = biblioteca.estado === 'ok' ? biblioteca.biblioteca : null
  const visitas = pronto ? listarVisitas(pronto.visitas) : []
  const consulta = pronto ? consultaDocumentos(pronto, ano, categoria) : null
  const anos = consulta ? [...new Set([ano, ...consulta.anos])].sort((a, b) => b.localeCompare(a)) : [ano]

  return (
    <>
      <section className="bloco" id="manutencoes">
        <h2>Manutenções</h2>
        {pronto ? <ListaVisitas visitas={visitas} /> : <p className="nota">A consulta de manutenções ainda não está disponível neste ambiente.</p>}
      </section>

      <section className="bloco" id="documentos">
        <h2>Documentos</h2>
        <p className="nota">Estes são os documentos já gravados. Esta consulta não cria nem copia arquivo.</p>
        <nav className="atalhos" aria-label="Ano dos documentos">
          {anos.map((item) => (
            <a key={item} href={caminho(condominioId, item, categoria)} aria-current={item === ano ? 'page' : undefined}>
              {item}
            </a>
          ))}
        </nav>
        <nav className="atalhos" aria-label="Categorias dos documentos">
          {CATEGORIAS.map((item) => (
            <a key={item.id} href={caminho(condominioId, ano, item.id)} aria-current={item.id === categoria ? 'page' : undefined}>
              {item.rotulo}
            </a>
          ))}
        </nav>
        {categoria === 'ocorrencias' ? (
          <PreparacaoOcorrencias />
        ) : pronto && consulta ? (
          <ListaDocumentos ano={ano} categoria={categoria} grupos={consulta.grupos} />
        ) : (
          <p className="nota">A biblioteca ainda não está disponível neste ambiente.</p>
        )}
      </section>

      <section className="bloco" id="ocorrencias">
        <h2>Ocorrências</h2>
        <PreparacaoOcorrencias />
      </section>
    </>
  )
}

function ListaVisitas({ visitas }: { visitas: ReturnType<typeof listarVisitas> }) {
  if (visitas.length === 0) return <p className="vazio">Nenhuma manutenção deste condomínio.</p>
  return (
    <ul className="historico">
      {visitas.map((visita) => (
        <li key={visita.id}>
          <div>
            <strong>{tituloVisita(visita)}</strong>
            <span className="meta">
              {visita.dataEfetiva ? `Realizada em ${dataHumana(visita.dataEfetiva)}` : `Programada para ${dataHumana(visita.dataProgramada)}`}
              {' · '}
              {visita.registroAnterior ? 'Registro anterior' : rotuloStatusVisita(visita.status)}
            </span>
          </div>
          <div className="acoes">
            <a className="botao botao-secundario" href={`/adm/manutencoes/${visita.id}`}>
              Abrir manutenção
            </a>
          </div>
        </li>
      ))}
    </ul>
  )
}

function ListaDocumentos({
  ano,
  categoria,
  grupos,
}: {
  ano: string
  categoria: CategoriaBiblioteca
  grupos: ReturnType<typeof consultaDocumentos>['grupos']
}) {
  if (grupos.length === 0) {
    return (
      <p className="vazio">
        {categoria === 'confirmacoes' ? `Nenhuma confirmação em ${ano}.` : `Nenhum documento de manutenção em ${ano}.`}
      </p>
    )
  }

  if (categoria === 'confirmacoes') {
    return (
      <ul className="historico">
        {grupos.flatMap((grupo) => grupo.documentos.map((documento) => (
          <li key={`${grupo.manutencaoId}-${documento.codigo}`}>
            <div>
              <strong>{documento.rotulo}</strong>
              <span className="meta">{grupo.titulo} · {dataHumana(grupo.data)}</span>
            </div>
            <div className="acoes">
              <a className="botao botao-secundario" href={documento.href}>Abrir documento</a>
            </div>
          </li>
        )))}
      </ul>
    )
  }

  return (
    <ul className="historico">
      {grupos.map((grupo) => (
        <li key={grupo.manutencaoId}>
          <div>
            <strong>{grupo.titulo}</strong>
            <span className="meta">Realizada em {dataHumana(grupo.data)}</span>
          </div>
          <div className="acoes">
            {grupo.documentos.map((documento) => (
              <a key={documento.href} className="botao botao-secundario" href={documento.href}>
                {documento.rotulo}
              </a>
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}

function PreparacaoOcorrencias() {
  return <p className="vazio">Os comunicados de ocorrência entram aqui numa próxima etapa.</p>
}

function caminho(condominioId: string, ano: string, categoria: CategoriaBiblioteca) {
  const params = new URLSearchParams()
  params.set('ano', ano)
  if (categoria !== 'manutencoes') params.set('categoria', categoria)
  return `/adm/condominios/${condominioId}?${params.toString()}#documentos`
}
