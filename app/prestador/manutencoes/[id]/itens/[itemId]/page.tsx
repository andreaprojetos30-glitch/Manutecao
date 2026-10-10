import { Moldura } from '@/app/componentes/Moldura'
import { FormOcorrencia } from '@/app/prestador/FormOcorrencia'
import { lerVisitaPrestador } from '@/lib/consultas-execucao'
import { assinarFoto } from '@/lib/fotos'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ocorrência · ELEVA Manutenção' }

export default async function OcorrenciaPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>
}) {
  const { id, itemId } = await params
  const resultado = await lerVisitaPrestador(id)
  const voltar = `/prestador/manutencoes/${id}`
  const visita = resultado.visita
  const item = visita?.itens.find((linha) => linha.id === itemId) ?? null

  if (!resultado.ativo || !visita || !item || !visita.editavel) {
    return (
      <Moldura campo>
        <section className="campo">
          <h1>Ocorrência</h1>
          <p className="vazio">
            {resultado.ativo ? 'Este equipamento não está aberto para registro.' : 'Seu acesso à execução está inativo. Procure a ELEVA.'}
          </p>
          <a className="botao" href={resultado.ativo ? voltar : '/prestador'}>
            Voltar
          </a>
        </section>
      </Moldura>
    )
  }

  const supabase = await createClient()
  const fotoUrl = await assinarFoto(supabase, item.ocorrencia?.foto)

  return (
    <Moldura campo>
      <section className="campo">
        <h1>Ocorrência</h1>
        <p className="subtitulo">{visita.condominio_nome}</p>
        <FormOcorrencia
          manutencaoId={visita.id}
          itemId={item.id}
          nome={item.nome}
          descricaoInicial={item.ocorrencia?.descricao ?? ''}
          resolvidaInicial={item.ocorrencia ? (item.ocorrencia.resolvida ? 'sim' : 'nao') : ''}
          fotoAtual={item.ocorrencia?.foto ?? ''}
          fotoUrl={fotoUrl}
          voltar={voltar}
        />
      </section>
    </Moldura>
  )
}
