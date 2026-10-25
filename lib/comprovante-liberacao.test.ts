import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { textoSalvo } from './cadastros.ts'
import { BUCKET_PDFS, type BucketPrivado } from './comprovante-armazenamento.ts'
import {
  SELECT_COMPROVANTE,
  executarLiberacaoComprovante,
  integrarComprovante,
  interpretarLinhaComprovante,
  situacaoLiberacaoComprovante,
  type OcorrenciaDaLiberacao,
} from './comprovante-liberacao.ts'
import type { VisitaParaComprovante } from './comprovante.ts'
import { mensagemManutencao } from './manutencoes.ts'

const ID = '00000000-0000-4000-8000-0000000000aa'
const SEGREDOS = [
  'SEGREDO-DESCRICAO',
  'SEGREDO-FOTO',
  'SEGREDO-PROVIDENCIA',
  'SEGREDO-SOLUCAO',
  'SEGREDO-SINDICO',
  'SEGREDO-OBS',
  'SEGREDO-CLASSIFICACAO',
]

function visita(parcial: Partial<VisitaParaComprovante> = {}): VisitaParaComprovante {
  return {
    tipo: 'preventiva',
    numeroVisita: 24,
    quantidadeVisitas: 36,
    registroAnterior: false,
    status: 'realizada',
    condominio: 'Manoá Residencie',
    dataEfetiva: '2026-11-01',
    prestador: 'Geovane',
    equipamentos: [{ nome: 'Esteira' }, { nome: 'Bike' }],
    ...parcial,
  }
}

function ocorrencia(parcial: Partial<OcorrenciaDaLiberacao> = {}): OcorrenciaDaLiberacao {
  return {
    resolvidaNoLocal: false,
    necessitaOrcamento: false,
    situacao: 'aberta',
    orcamentoInformado: false,
    ...parcial,
  }
}

function armazenamento() {
  const chamadas: Array<{ bucket: string; caminho: string; conteudo: Uint8Array; opcoes: { contentType: string; upsert: boolean } }> = []
  const proibidos: string[] = []
  const cliente: BucketPrivado & { chamadas: typeof chamadas; proibidos: string[] } = {
    chamadas,
    proibidos,
    from(bucket) {
      const api = {
        async upload(caminho: string, conteudo: Uint8Array, opcoes: { contentType: 'application/pdf'; upsert: false }) {
          chamadas.push({ bucket, caminho, conteudo, opcoes })
          return { error: null }
        },
      }
      return new Proxy(api, {
        get(alvo, propriedade, receptor) {
          if (propriedade === 'getPublicUrl' || propriedade === 'createSignedUrl') {
            proibidos.push(String(propriedade))
            throw new Error('URL pública não permitida')
          }
          return Reflect.get(alvo, propriedade, receptor)
        },
      })
    },
  }
  return cliente
}

async function textoPdf(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice(), isEvalSupported: false, disableWorker: true } as Parameters<typeof getDocument>[0]).promise
  const pagina = await pdf.getPage(1)
  const conteudo = await pagina.getTextContent()
  return conteudo.items.map((item) => ('str' in item ? item.str : '')).join('\n')
}

function linhaSuja(parcial: Record<string, unknown> = {}) {
  return {
    id: ID,
    tipo: 'preventiva',
    numero_visita: 24,
    quantidade_visitas_interna: 36,
    data_realizada: '2026-11-01',
    registro_anterior: false,
    status: 'realizada',
    pdf_url: null,
    descricao_original: 'SEGREDO-DESCRICAO',
    foto_url: 'SEGREDO-FOTO',
    providencia: 'SEGREDO-PROVIDENCIA',
    solucao: 'SEGREDO-SOLUCAO',
    texto_para_sindico: 'SEGREDO-SINDICO',
    observacoes_administrativas: 'SEGREDO-OBS',
    classificacao_interna: 'SEGREDO-CLASSIFICACAO',
    condominios: { nome: 'Manoá Residencie' },
    prestadores: { nome: 'Geovane' },
    contratos: { quantidade_visitas: 36 },
    itens_manutencao: [
      {
        nome_identificacao: 'Esteira',
        descricao: 'SEGREDO-DESCRICAO',
        ocorrencias: {
          resolvida_no_local: true,
          necessita_orcamento: false,
          status_ocorrencia: 'resolvida',
          orcamento_informado: false,
          descricao_original: 'SEGREDO-DESCRICAO',
          foto_url: 'SEGREDO-FOTO',
          providencia: 'SEGREDO-PROVIDENCIA',
          solucao: 'SEGREDO-SOLUCAO',
        },
      },
      { nome_identificacao: 'Bike' },
    ],
    ...parcial,
  }
}

test('consulta do comprovante não pede campo interno', () => {
  const proibidos = ['descricao', 'foto', 'providencia', 'solucao', 'observacao', 'sindico', 'classificacao', 'whatsapp', 'token', 'email']
  for (const campo of proibidos) assert.equal(SELECT_COMPROVANTE.includes(campo), false, campo)
  assert.equal(SELECT_COMPROVANTE.includes('nome_identificacao'), true)
  assert.equal(SELECT_COMPROVANTE.includes('resolvida_no_local'), true)
  assert.equal(SELECT_COMPROVANTE.includes('necessita_orcamento'), true)
  assert.equal(SELECT_COMPROVANTE.includes('orcamento_informado'), true)
  assert.equal(SELECT_COMPROVANTE.includes('pdf_url'), true)
})

test('linha interna vira só os campos do comprovante', () => {
  const montado = interpretarLinhaComprovante(linhaSuja())
  assert.ok(montado)
  const serializado = JSON.stringify(montado.visita)
  for (const segredo of SEGREDOS) assert.equal(serializado.includes(segredo), false)
  assert.equal(serializado.includes('descricao'), false)
  assert.equal(serializado.includes('foto'), false)
  assert.deepEqual(montado.visita.equipamentos, [{ nome: 'Esteira' }, { nome: 'Bike' }])
  assert.equal(montado.ocorrencias[0]?.resolvidaNoLocal, true)
  assert.equal(montado.caminhoAtual, null)
  assert.equal(JSON.stringify(montado).includes('https://'), false)
})

test('decisão libera, espera resposta ou espera autorização', () => {
  const base = { registroAnterior: false, status: 'realizada', caminho: null }
  assert.equal(situacaoLiberacaoComprovante(base, []), 'liberar')
  assert.equal(situacaoLiberacaoComprovante(base, [ocorrencia({ resolvidaNoLocal: true, necessitaOrcamento: true, situacao: 'aguardando_orcamento' })]), 'liberar')
  assert.equal(situacaoLiberacaoComprovante({ ...base, status: 'aguardando_administracao' }, [ocorrencia()]), 'responder')
  assert.equal(situacaoLiberacaoComprovante({ ...base, status: 'aguardando_administracao' }, [ocorrencia({ orcamentoInformado: true })]), 'liberar')
  assert.equal(situacaoLiberacaoComprovante({ ...base, status: 'aguardando_administracao' }, [ocorrencia({ orcamentoInformado: true, necessitaOrcamento: true })]), 'autorizar')
  assert.equal(situacaoLiberacaoComprovante({ ...base, status: 'aguardando_administracao' }, [ocorrencia({ orcamentoInformado: true, situacao: 'aguardando_orcamento' })]), 'autorizar')
  assert.equal(situacaoLiberacaoComprovante({ ...base, status: 'cancelada' }, []), 'recusada')
  assert.equal(situacaoLiberacaoComprovante({ ...base, registroAnterior: true }, []), 'recusada')
  assert.equal(situacaoLiberacaoComprovante({ ...base, caminho: `${ID}/comprovante.pdf` }, [ocorrencia({ necessitaOrcamento: true })]), 'liberada')
  assert.equal(situacaoLiberacaoComprovante({ ...base, caminho: 'https://exemplo/publico.pdf' }, []), 'recusada')
})

test('finalização sem ocorrência, resolvida no local, sem orçamento e com orçamento', async () => {
  const casos = [
    {
      nome: 'sem ocorrência',
      visita: visita(),
      ocorrencias: [],
      autorizar: false,
      titulo: 'VISITA 24/36',
    },
    {
      nome: 'resolvida no local',
      visita: visita(),
      ocorrencias: [ocorrencia({ resolvidaNoLocal: true, situacao: 'resolvida' })],
      autorizar: false,
      titulo: 'VISITA 24/36',
    },
    {
      nome: 'sem orçamento',
      visita: visita({ status: 'aguardando_administracao' }),
      ocorrencias: [ocorrencia({ orcamentoInformado: true, situacao: 'em_analise' })],
      autorizar: false,
      titulo: 'VISITA 24/36',
    },
    {
      nome: 'orçamento pendente autorizado',
      visita: visita({ status: 'aguardando_administracao' }),
      ocorrencias: [ocorrencia({ orcamentoInformado: true, necessitaOrcamento: true, situacao: 'aguardando_orcamento' })],
      autorizar: true,
      titulo: 'VISITA 24/36',
    },
  ]

  for (const caso of casos) {
    const destino = armazenamento()
    let caminhoRegistrado: string | null = null
    const resultado = await executarLiberacaoComprovante({
      manutencaoId: ID,
      visita: caso.visita,
      ocorrencias: caso.ocorrencias,
      caminhoAtual: null,
      autorizar: caso.autorizar,
      armazenamento: destino,
      async registrar(caminho) {
        caminhoRegistrado = caminho
        return { erro: null }
      },
    })
    assert.equal(resultado.erro, null, caso.nome)
    assert.equal(resultado.caminho, `${ID}/comprovante.pdf`, caso.nome)
    assert.equal(caminhoRegistrado, `${ID}/comprovante.pdf`, caso.nome)
    assert.equal(destino.chamadas.length, 1, caso.nome)
    assert.equal(destino.chamadas[0]?.bucket, BUCKET_PDFS, caso.nome)
    assert.equal(destino.chamadas[0]?.opcoes.upsert, false, caso.nome)
    assert.equal(destino.chamadas[0]?.opcoes.contentType, 'application/pdf', caso.nome)
    assert.deepEqual(destino.proibidos, [], caso.nome)
    assert.ok(resultado.pdf)
    const texto = await textoPdf(resultado.pdf)
    assert.equal(texto.includes(caso.titulo), true, caso.nome)
    assert.equal(texto.includes('Manoá Residencie'), true, caso.nome)
    assert.equal(texto.includes('Geovane'), true, caso.nome)
    assert.equal(texto.includes('Esteira'), true, caso.nome)
    for (const segredo of SEGREDOS) assert.equal(texto.includes(segredo), false, caso.nome)
    assert.equal(/ocorr[eê]ncia/i.test(texto), false, caso.nome)
    assert.equal(/or[cç]amento/i.test(texto), false, caso.nome)
    assert.equal(/provid[eê]ncia/i.test(texto), false, caso.nome)
    assert.equal(texto.includes('http'), false, caso.nome)
  }
})

test('orçamento pendente não gera PDF antes da autorização', async () => {
  const destino = armazenamento()
  let registrou = false
  const resultado = await executarLiberacaoComprovante({
    manutencaoId: ID,
    visita: visita({ status: 'aguardando_administracao' }),
    ocorrencias: [ocorrencia({ orcamentoInformado: true, necessitaOrcamento: true, situacao: 'aguardando_orcamento' })],
    caminhoAtual: null,
    autorizar: false,
    armazenamento: destino,
    async registrar() {
      registrou = true
      return { erro: null }
    },
  })
  assert.equal(resultado.erro, 'O comprovante aguarda autorização.')
  assert.equal(resultado.caminho, null)
  assert.equal(resultado.pdf, null)
  assert.equal(destino.chamadas.length, 0)
  assert.equal(registrou, false)
})

test('títulos de avulsa, corretiva e retorno não criam fração contratual', async () => {
  const casos = [
    ['avulsa', null, null, 'MANUTENÇÃO AVULSA'],
    ['corretiva', null, null, 'MANUTENÇÃO CORRETIVA'],
    ['corretiva_complementar', null, null, 'RETORNO TÉCNICO'],
  ] as const
  for (const [tipo, numero, total, titulo] of casos) {
    const destino = armazenamento()
    const resultado = await executarLiberacaoComprovante({
      manutencaoId: ID,
      visita: visita({ tipo, numeroVisita: numero, quantidadeVisitas: total }),
      ocorrencias: [],
      caminhoAtual: null,
      autorizar: false,
      armazenamento: destino,
      async registrar() {
        return { erro: null }
      },
    })
    assert.equal(resultado.erro, null, titulo)
    assert.ok(resultado.pdf)
    const texto = await textoPdf(resultado.pdf)
    assert.equal(texto.includes(titulo), true, titulo)
    assert.equal(/VISITA \d+\/\d+/.test(texto), false, titulo)
  }
})

test('cancelada e registro anterior não são armazenados', async () => {
  for (const parcial of [{ status: 'cancelada' }, { registroAnterior: true }]) {
    const destino = armazenamento()
    const resultado = await executarLiberacaoComprovante({
      manutencaoId: ID,
      visita: visita(parcial),
      ocorrencias: [],
      caminhoAtual: null,
      autorizar: false,
      armazenamento: destino,
      async registrar() {
        return { erro: null }
      },
    })
    assert.equal(resultado.caminho, null)
    assert.equal(destino.chamadas.length, 0)
  }
})

test('integração lê a lista fechada e guarda só o caminho', async () => {
  let colunas = ''
  let gravacao: Record<string, unknown> | null = null
  const destino = armazenamento()
  const liberacao = await integrarComprovante(
    {
      from() {
        return {
          select(valor: string) {
            colunas = valor
            return {
              eq() {
                return { maybeSingle: async () => ({ data: linhaSuja({ status: 'realizada' }), error: null }) }
              },
            }
          },
        }
      },
      async rpc(_fn: string, args: Record<string, unknown>) {
        gravacao = args
        return { error: null }
      },
    },
    destino,
    ID,
    false,
  )
  assert.equal(liberacao.erro, null)
  assert.equal(liberacao.situacao, 'liberada')
  assert.equal(liberacao.caminho, `${ID}/comprovante.pdf`)
  assert.equal(colunas, SELECT_COMPROVANTE)
  assert.equal(gravacao?.p_autorizar, false)
  assert.equal(gravacao?.p_caminho, `${ID}/comprovante.pdf`)
  assert.equal(JSON.stringify(gravacao).includes('SEGREDO'), false)
  assert.equal(JSON.stringify(gravacao).includes('http'), false)
  assert.ok(destino.chamadas[0])
  const texto = await textoPdf(destino.chamadas[0].conteudo)
  for (const segredo of SEGREDOS) assert.equal(texto.includes(segredo), false)
})

test('ficha pede o orçamento e a autorização sem URL pública', () => {
  const ficha = fs.readFileSync('app/adm/manutencoes/[id]/page.tsx', 'utf8')
  const tratamento = fs.readFileSync('app/adm/manutencoes/TratamentoOcorrencia.tsx', 'utf8')
  const prestador = fs.readFileSync('app/prestador/acoes.ts', 'utf8')
  assert.equal(tratamento.includes('Depende de orçamento?'), true)
  assert.equal(ficha.includes('Autorizar liberação do comprovante'), true)
  assert.equal(ficha.includes('getPublicUrl'), false)
  assert.equal(ficha.includes('object/public'), false)
  assert.equal(tratamento.includes('getPublicUrl'), false)
  assert.equal(prestador.includes('getPublicUrl'), false)
  assert.equal(prestador.includes('registrar_tratamento_ocorrencia'), false)
  assert.equal(textoSalvo('comprovante'), 'Comprovante liberado.')
  assert.equal(textoSalvo('orcamento'), 'A ocorrência depende de orçamento. O comprovante aguarda autorização.')
  assert.equal(mensagemManutencao('falha https://projeto.supabase.co/storage/v1/object/public/pdfs/comprovante.pdf SEGREDO'), 'Não foi possível salvar. Confira os dados e tente de novo.')
})
