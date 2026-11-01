import assert from 'node:assert/strict'
import test from 'node:test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { carregarRecursosComprovante, COR_DOURADO, COR_FUNDO, COR_VERDE } from './comprovante-pdf.ts'
import {
  AVISO_CONFIRMACAO_PDF,
  ROTULO_SEM_VALIDADE,
  type DocumentoConfirmacao,
} from './confirmacao-manual.ts'
import { gerarPdfConfirmacao } from './confirmacao-pdf.ts'

const manual: DocumentoConfirmacao = {
  codigo: 'CM-2026-000007',
  caminho: '00000000-0000-4000-8000-0000000000aa/confirmacoes/CM-2026-000007.pdf',
  classe: 'confirmacao',
  origem: 'manual',
  condominio: 'Condomínio Confirmação Manual',
  tituloManutencao: 'MANUTENÇÃO AVULSA',
  dataManutencao: '01/11/2026',
  ocorridoEm: '01/11/2026, 15:00',
  responsavel: 'Ana ADM',
  papel: null,
  destinatarioNome: 'Síndico Manual',
  destinatarioPapel: 'sindico',
  justificativa: 'O síndico informou o recebimento por telefone e não conseguiu abrir o link.',
  codigoOrigem: null,
}

async function texto(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice(), isEvalSupported: false, disableWorker: true } as Parameters<typeof getDocument>[0]).promise
  const paginas: string[] = []
  for (let numero = 1; numero <= pdf.numPages; numero += 1) {
    const pagina = await pdf.getPage(numero)
    const conteudo = await pagina.getTextContent()
    paginas.push(conteudo.items.map((item) => ('str' in item ? item.str : '')).join('\n'))
  }
  return paginas.join('\n').replace(/\s+/g, ' ')
}

test('PDF de confirmação manual e declaração preservam a identidade e não parecem assinatura', async () => {
  const recursos = await carregarRecursosComprovante()
  const gerado = await gerarPdfConfirmacao(manual, recursos)
  assert.equal(gerado.erro, null)
  assert.ok(gerado.pdf)
  const lido = await texto(gerado.pdf)
  assert.equal(lido.includes(AVISO_CONFIRMACAO_PDF), true)
  assert.equal(lido.includes('CONFIRMAÇÃO DE RECEBIMENTO'), true)
  assert.equal(lido.includes('Registro manual pelo ADM'), true)
  assert.equal(lido.includes('Ana ADM'), true)
  assert.equal(lido.includes(manual.justificativa), true)
  assert.equal(lido.includes('CM-2026-000007'), true)
  assert.equal(lido.includes('Condomínio Confirmação Manual'), true)
  assert.equal(lido.includes('MANUTENÇÃO AVULSA'), true)
  assert.equal(lido.includes('01/11/2026'), true)
  assert.equal(/assinatura eletrônica|aprovação técnica/.test(lido), true)
  assert.equal(lido.includes('DECLARAÇÃO DE CORREÇÃO'), false)

  const declaracao = await gerarPdfConfirmacao({
    ...manual,
    codigo: 'CM-2026-000007-D',
    classe: 'declaracao',
    origem: null,
    justificativa: 'O telefonema foi registrado na manutenção errada.',
    codigoOrigem: 'CM-2026-000007',
    ocorridoEm: '01/11/2026, 16:10',
    destinatarioNome: null,
    destinatarioPapel: null,
  }, recursos)
  assert.ok(declaracao.pdf)
  const correcao = await texto(declaracao.pdf)
  assert.equal(correcao.includes('DECLARAÇÃO DE CORREÇÃO'), true)
  assert.equal(correcao.includes('CM-2026-000007-D'), true)
  assert.equal(correcao.includes('CM-2026-000007'), true)
  assert.equal(correcao.includes(ROTULO_SEM_VALIDADE), true)
  assert.equal(correcao.includes('não é uma nova confirmação válida'), true)
  assert.equal(correcao.includes('O telefonema foi registrado na manutenção errada.'), true)
  assert.equal(correcao.includes('Registro manual pelo ADM'), false)
  assert.equal(JSON.stringify({ verde: COR_VERDE, dourado: COR_DOURADO, fundo: COR_FUNDO }).includes('#1e3a2b'), true)
})
