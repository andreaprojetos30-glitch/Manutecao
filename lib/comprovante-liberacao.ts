import { createClient } from '@supabase/supabase-js'
import { idValido } from '@/lib/cadastros'
import {
  comprovanteExigeAutorizacao,
  prepararComprovante,
  type VisitaParaComprovante,
} from '@/lib/comprovante'
import {
  armazenarComprovante,
  BUCKET_PDFS,
  caminhoComprovante,
  type BucketPrivado,
} from '@/lib/comprovante-armazenamento'
import { carregarRecursosComprovante, gerarPdfComprovante } from '@/lib/comprovante-pdf'

export const SELECT_COMPROVANTE = [
  'id',
  'tipo',
  'numero_visita',
  'data_realizada',
  'registro_anterior',
  'status',
  'pdf_url',
  'condominios(nome)',
  'prestadores(nome)',
  'contratos(quantidade_visitas)',
  'itens_manutencao(nome_identificacao, ocorrencias(resolvida_no_local, necessita_orcamento, status_ocorrencia, orcamento_informado))',
].join(', ')

export type OcorrenciaDaLiberacao = {
  resolvidaNoLocal: boolean
  necessitaOrcamento: boolean
  situacao: string
  orcamentoInformado: boolean
}

export type SituacaoLiberacao = 'recusada' | 'liberada' | 'autorizar' | 'responder' | 'liberar'

export type MontagemComprovante = {
  manutencaoId: string
  visita: VisitaParaComprovante
  ocorrencias: OcorrenciaDaLiberacao[]
  caminhoAtual: string | null
}

type Resposta = { data: unknown; error: { message: string } | null }

export type LeitorComprovante = {
  from(relacao: string): {
    select(colunas: string): {
      eq(coluna: string, valor: string): {
        maybeSingle(): Promise<Resposta>
      }
    }
  }
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data?: unknown; error: { message: string } | null }>
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor : ''
}

function nomeDe(valor: unknown) {
  const linha = Array.isArray(valor) ? valor[0] : valor
  if (!linha || typeof linha !== 'object') return ''
  return texto((linha as { nome?: unknown }).nome)
}

function listaDe(valor: unknown) {
  if (Array.isArray(valor)) return valor
  if (valor && typeof valor === 'object') return [valor]
  return []
}

export function situacaoLiberacaoComprovante(
  visita: { registroAnterior: boolean; status: string; caminho: string | null },
  ocorrencias: OcorrenciaDaLiberacao[],
): SituacaoLiberacao {
  if (visita.registroAnterior || visita.status === 'cancelada') return 'recusada'
  if (visita.status !== 'realizada' && visita.status !== 'aguardando_administracao') return 'recusada'
  const esperado = visita.caminho
  if (esperado && !esperado.includes('://') && !esperado.includes('..')) {
    const id = esperado.split('/')[0] ?? ''
    if (caminhoComprovante(id) === esperado) return 'liberada'
  }
  if (esperado) return 'recusada'
  const pendentes = ocorrencias.filter((item) => item.resolvidaNoLocal !== true)
  if (comprovanteExigeAutorizacao(pendentes)) return 'autorizar'
  if (pendentes.some((item) => item.orcamentoInformado !== true)) return 'responder'
  return 'liberar'
}

export function interpretarLinhaComprovante(linha: unknown): MontagemComprovante | null {
  if (!linha || typeof linha !== 'object') return null
  const bruto = linha as Record<string, unknown>
  const manutencaoId = texto(bruto.id)
  if (!idValido(manutencaoId)) return null
  const contrato = Array.isArray(bruto.contratos) ? bruto.contratos[0] : bruto.contratos
  const quantidade = contrato && typeof contrato === 'object' ? (contrato as { quantidade_visitas?: unknown }).quantidade_visitas : null
  const ocorrencias: OcorrenciaDaLiberacao[] = []
  const equipamentos = listaDe(bruto.itens_manutencao).map((item) => {
    const nome = texto((item as { nome_identificacao?: unknown }).nome_identificacao)
    const ficha = listaDe((item as { ocorrencias?: unknown }).ocorrencias)[0] as Record<string, unknown> | undefined
    if (ficha) {
      ocorrencias.push({
        resolvidaNoLocal: ficha.resolvida_no_local === true,
        necessitaOrcamento: ficha.necessita_orcamento === true,
        situacao: texto(ficha.status_ocorrencia),
        orcamentoInformado: ficha.orcamento_informado === true,
      })
    }
    return { nome }
  })
  const caminho = caminhoComprovante(manutencaoId)
  const gravado = texto(bruto.pdf_url).trim()
  return {
    manutencaoId,
    caminhoAtual: caminho !== null && gravado === caminho ? caminho : gravado ? 'recusado' : null,
    ocorrencias,
    visita: {
      tipo: texto(bruto.tipo),
      numeroVisita: typeof bruto.numero_visita === 'number' ? bruto.numero_visita : null,
      quantidadeVisitas: typeof quantidade === 'number' ? quantidade : null,
      registroAnterior: bruto.registro_anterior === true,
      status: texto(bruto.status),
      condominio: nomeDe(bruto.condominios),
      dataEfetiva: texto(bruto.data_realizada) ? texto(bruto.data_realizada).slice(0, 10) : null,
      prestador: nomeDe(bruto.prestadores) || null,
      equipamentos,
    },
  }
}

function mensagemSituacao(situacao: SituacaoLiberacao, autorizar: boolean) {
  if (situacao === 'liberada') return 'O comprovante já foi liberado.'
  if (autorizar) return 'Esta manutenção não aguarda autorização do comprovante.'
  if (situacao === 'autorizar') return 'O comprovante aguarda autorização.'
  if (situacao === 'responder') return 'Informe se a ocorrência depende de orçamento.'
  return 'Esta manutenção não gera comprovante.'
}

export async function executarLiberacaoComprovante(entrada: {
  manutencaoId: string
  visita: VisitaParaComprovante
  ocorrencias: OcorrenciaDaLiberacao[]
  caminhoAtual: string | null
  autorizar: boolean
  armazenamento: BucketPrivado
  registrar: (caminho: string) => Promise<{ erro: string | null }>
}) {
  const situacao = situacaoLiberacaoComprovante(
    {
      registroAnterior: entrada.visita.registroAnterior,
      status: entrada.visita.status,
      caminho: entrada.caminhoAtual,
    },
    entrada.ocorrencias,
  )
  const permitido = entrada.autorizar ? situacao === 'autorizar' : situacao === 'liberar'
  if (!permitido) return { erro: mensagemSituacao(situacao, entrada.autorizar), caminho: null, situacao, pdf: null }

  const preparado = prepararComprovante(entrada.visita)
  if (!preparado.comprovante) return { erro: preparado.erro, caminho: null, situacao, pdf: null }
  const gerado = await gerarPdfComprovante(preparado.comprovante, await carregarRecursosComprovante())
  if (!gerado.pdf) return { erro: gerado.erro ?? 'O comprovante não pôde ser gerado.', caminho: null, situacao, pdf: null }

  const guardado = await armazenarComprovante(entrada.armazenamento, entrada.manutencaoId, gerado.pdf)
  if (guardado.erro || !guardado.caminho) {
    return { erro: guardado.erro ?? 'O comprovante não foi armazenado.', caminho: null, situacao, pdf: null }
  }
  const registro = await entrada.registrar(guardado.caminho)
  if (registro.erro) return { erro: registro.erro, caminho: null, situacao, pdf: null }
  return { erro: null, caminho: guardado.caminho, situacao: 'liberada' as const, pdf: gerado.pdf }
}

export function adaptarBucket(cliente: {
  storage: {
    from(bucket: string): {
      upload(
        caminho: string,
        conteudo: Uint8Array,
        opcoes: { contentType: string; upsert: boolean },
      ): Promise<{ error: { message: string } | null }>
    }
  }
}): BucketPrivado {
  return {
    from() {
      const destino = cliente.storage.from(BUCKET_PDFS)
      return {
        upload(caminho, conteudo, opcoes) {
          return destino.upload(caminho, conteudo, opcoes)
        },
      }
    },
  }
}

export function bucketServicoComprovante(): BucketPrivado | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return null
  const cliente = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return adaptarBucket(cliente)
}

export async function integrarComprovante(
  supabase: LeitorComprovante,
  armazenamento: BucketPrivado | null,
  manutencaoId: string,
  autorizar: boolean,
) {
  if (!idValido(manutencaoId)) return { erro: 'Manutenção não encontrada.', situacao: 'recusada' as const, caminho: null }
  const consulta = await supabase.from('manutencoes').select(SELECT_COMPROVANTE).eq('id', manutencaoId).maybeSingle()
  if (consulta.error || !consulta.data) return { erro: 'Manutenção não encontrada.', situacao: 'recusada' as const, caminho: null }
  const montado = interpretarLinhaComprovante(consulta.data)
  if (!montado) return { erro: 'Manutenção não encontrada.', situacao: 'recusada' as const, caminho: null }

  const situacao = situacaoLiberacaoComprovante(
    {
      registroAnterior: montado.visita.registroAnterior,
      status: montado.visita.status,
      caminho: montado.caminhoAtual,
    },
    montado.ocorrencias,
  )
  const permitido = autorizar ? situacao === 'autorizar' : situacao === 'liberar'
  if (!permitido) return { erro: null, situacao, caminho: montado.caminhoAtual }

  if (!armazenamento) return { erro: 'O comprovante não foi armazenado.', situacao, caminho: null }
  return executarLiberacaoComprovante({
    manutencaoId: montado.manutencaoId,
    visita: montado.visita,
    ocorrencias: montado.ocorrencias,
    caminhoAtual: montado.caminhoAtual,
    autorizar,
    armazenamento,
    async registrar(caminho) {
      const { error } = await supabase.rpc('registrar_comprovante', {
        p_id: montado.manutencaoId,
        p_caminho: caminho,
        p_autorizar: autorizar,
      })
      return { erro: error ? error.message : null }
    },
  })
}
