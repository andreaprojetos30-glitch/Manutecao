import assert from 'node:assert/strict'
import test from 'node:test'
import { PDFDocument } from 'pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { CAMPOS_COMPROVANTE, prepararComprovante, type VisitaParaComprovante } from './comprovante.ts'
import {
  COR_DOURADO,
  COR_FUNDO,
  COR_VERDE,
  carregarRecursosComprovante,
  fecharComprovante,
  gerarPdfComprovante,
  quebrarTexto,
  tituloPdfPermitido,
  type RecursosPdfComprovante,
} from './comprovante-pdf.ts'

const SEGREDOS = [
  'SEGREDO-DESCRICAO',
  'SEGREDO-FOTO',
  'SEGREDO-PROVIDENCIA',
  'SEGREDO-SOLUCAO',
  'SEGREDO-SINDICO',
  'SEGREDO-OBS',
  'SEGREDO-CLASSIFICACAO',
  'SEGREDO-OCORRENCIA',
]

const PNG_MINIMO = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
))

function visita(parcial: Partial<VisitaParaComprovante> = {}): VisitaParaComprovante {
  return {
    tipo: 'preventiva',
    numeroVisita: 2,
    quantidadeVisitas: 12,
    registroAnterior: false,
    status: 'realizada',
    condominio: 'Condomínio Açores de São José',
    dataEfetiva: '2026-03-18',
    prestador: 'Helena Duarte',
    equipamentos: [{ nome: 'Elíptico' }, { nome: 'Bicicleta horizontal' }],
    ...parcial,
  }
}

function junto(valor: string) {
  return valor.normalize('NFC').replace(/\s+/g, '')
}

function corDoOperador(args: unknown) {
  if (!Array.isArray(args) || args.length === 0) return null
  if (typeof args[0] === 'string' && /^#[0-9a-f]{6}$/i.test(args[0])) return args[0].toLowerCase()
  if (args.length >= 3 && args.every((item) => typeof item === 'number')) {
    const [r, g, b] = args as number[]
    const escala = r > 1 || g > 1 || b > 1 ? 1 : 255
    const hex = [r, g, b].map((canal) => Math.round(canal * escala).toString(16).padStart(2, '0')).join('')
    return `#${hex}`
  }
  return null
}

async function lerPdf(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice(), isEvalSupported: false, disableWorker: true } as Parameters<typeof getDocument>[0]).promise
  const paginas: string[] = []
  const cores = { verde: false, dourado: false, fundo: false }
  let imagem = false
  for (let numero = 1; numero <= pdf.numPages; numero += 1) {
    const pagina = await pdf.getPage(numero)
    const conteudo = await pagina.getTextContent()
    paginas.push(conteudo.items.map((item) => ('str' in item ? item.str : '')).filter(Boolean).join('\n'))
    const operadores = await pagina.getOperatorList()
    for (let indice = 0; indice < operadores.fnArray.length; indice += 1) {
      const operacao = operadores.fnArray[indice]
      if (operacao === OPS.paintImageXObject || operacao === OPS.paintXObject) imagem = true
      if (operacao !== OPS.setFillRGBColor) continue
      const hex = corDoOperador(operadores.argsArray[indice])
      if (hex === COR_VERDE) cores.verde = true
      if (hex === COR_DOURADO) cores.dourado = true
      if (hex === COR_FUNDO) cores.fundo = true
    }
  }
  return { paginas, texto: paginas.join('\n'), cores, imagem }
}

let recursos: RecursosPdfComprovante

test.before(async () => {
  recursos = await carregarRecursosComprovante()
})

test('título do PDF aceita só os quatro textos aprovados', () => {
  assert.equal(tituloPdfPermitido('VISITA 2/12'), true)
  assert.equal(tituloPdfPermitido('VISITA 1/36'), true)
  assert.equal(tituloPdfPermitido('VISITA 36/36'), true)
  assert.equal(tituloPdfPermitido('MANUTENÇÃO AVULSA'), true)
  assert.equal(tituloPdfPermitido('MANUTENÇÃO CORRETIVA'), true)
  assert.equal(tituloPdfPermitido('RETORNO TÉCNICO'), true)
  assert.equal(tituloPdfPermitido('VISITA 01/12'), false)
  assert.equal(tituloPdfPermitido('VISITA 37/36'), false)
  assert.equal(tituloPdfPermitido('MANUTENÇÃO 7 DE 12 — REALIZADA EM 10/10/2026'), false)
  assert.equal(tituloPdfPermitido('Registro administrativo anterior à implantação. Sem checklist, foto ou ocorrência.'), false)
})

test('comprovante fechado descarta campo fora da lista', () => {
  const preparado = prepararComprovante(visita())
  assert.ok(preparado.comprovante)
  const sujo = {
    ...preparado.comprovante,
    descricao: 'SEGREDO-DESCRICAO',
    foto: 'SEGREDO-FOTO',
    providencia: 'SEGREDO-PROVIDENCIA',
    solucao: 'SEGREDO-SOLUCAO',
  }
  const fechado = fecharComprovante(sujo)
  assert.ok(fechado)
  assert.deepEqual(Object.keys(fechado), [...CAMPOS_COMPROVANTE])
  assert.equal(JSON.stringify(fechado).includes('SEGREDO'), false)
})

test('PDF da visita traz a identidade e só os dados permitidos', async () => {
  const preparado = prepararComprovante(visita())
  assert.ok(preparado.comprovante)
  const gerado = await gerarPdfComprovante(preparado.comprovante, recursos)
  assert.equal(gerado.erro, null)
  assert.ok(gerado.pdf)
  assert.equal(gerado.pdf[0], 0x25)
  assert.equal(Buffer.from(gerado.pdf.subarray(0, 5)).toString(), '%PDF-')

  const documento = await PDFDocument.load(gerado.pdf)
  const tamanho = documento.getPage(0).getSize()
  assert.ok(Math.abs(tamanho.width - 595.28) < 0.2)
  assert.ok(Math.abs(tamanho.height - 841.89) < 0.2)
  assert.equal(documento.getTitle(), 'VISITA 2/12')
  assert.equal(documento.getAuthor(), 'ELEVA')
  assert.equal(documento.getPageCount(), 1)

  const lido = await lerPdf(gerado.pdf)
  const texto = junto(lido.texto)
  for (const parte of ['ELEVA', 'VISITA 2/12', 'Condomínio Açores de São José', '18/03/2026', 'Helena Duarte', 'Elíptico', 'Bicicleta horizontal']) {
    assert.equal(texto.includes(junto(parte)), true, parte)
  }
  assert.equal(lido.cores.verde, true)
  assert.equal(lido.cores.dourado, true)
  assert.equal(lido.cores.fundo, true)
  assert.equal(lido.imagem, true)
  assert.equal(lido.texto.includes('REALIZADA EM'), false)
  assert.equal(lido.texto.includes('ocorrência'), false)
  assert.equal(lido.texto.includes('ocorrencia'), false)
  assert.equal(Buffer.from(gerado.pdf).toString('latin1').includes('/URI'), false)
})

test('os quatro títulos entram no PDF sem ocorrência', async () => {
  const casos = [
    { tipo: 'preventiva', numeroVisita: 24, quantidadeVisitas: 36, titulo: 'VISITA 24/36' },
    { tipo: 'avulsa', numeroVisita: null, quantidadeVisitas: null, titulo: 'MANUTENÇÃO AVULSA' },
    { tipo: 'corretiva', numeroVisita: null, quantidadeVisitas: null, titulo: 'MANUTENÇÃO CORRETIVA' },
    { tipo: 'corretiva_complementar', numeroVisita: null, quantidadeVisitas: null, titulo: 'RETORNO TÉCNICO' },
  ] as const

  for (const caso of casos) {
    const entrada = {
      ...visita({ tipo: caso.tipo, numeroVisita: caso.numeroVisita, quantidadeVisitas: caso.quantidadeVisitas }),
      descricao: 'SEGREDO-DESCRICAO',
      foto: 'SEGREDO-FOTO',
      providencia: 'SEGREDO-PROVIDENCIA',
      solucao: 'SEGREDO-SOLUCAO',
      observacao: 'SEGREDO-OBS',
      textoParaSindico: 'SEGREDO-SINDICO',
      equipamentos: [
        {
          nome: 'Elíptico',
          resultado: 'ocorrencia',
          resolvidaNoLocal: true,
          descricao: 'SEGREDO-DESCRICAO',
          foto: 'SEGREDO-FOTO',
          providencia: 'SEGREDO-PROVIDENCIA',
          solucao: 'SEGREDO-SOLUCAO',
        },
      ],
    }
    const preparado = prepararComprovante(entrada)
    assert.equal(preparado.comprovante?.titulo, caso.titulo)
    assert.ok(preparado.comprovante)
    const sujo = Object.assign({}, preparado.comprovante, {
      descricao: 'SEGREDO-DESCRICAO',
      foto: 'SEGREDO-FOTO',
      providencia: 'SEGREDO-PROVIDENCIA',
      solucao: 'SEGREDO-SOLUCAO',
      observacao: 'SEGREDO-OBS',
      textoParaSindico: 'SEGREDO-SINDICO',
      classificacao: 'SEGREDO-CLASSIFICACAO',
      ocorrencia: 'SEGREDO-OCORRENCIA',
    })
    const gerado = await gerarPdfComprovante(sujo, recursos)
    assert.equal(gerado.erro, null)
    assert.ok(gerado.pdf)
    const lido = await lerPdf(gerado.pdf)
    const cru = Buffer.from(gerado.pdf)
    assert.equal(junto(lido.texto).includes(junto(caso.titulo)), true)
    for (const segredo of SEGREDOS) {
      assert.equal(lido.texto.includes(segredo), false, segredo)
      assert.equal(cru.includes(Buffer.from(segredo)), false, segredo)
    }
    assert.equal(lido.texto.includes('resolvida'), false)
    assert.equal(lido.texto.includes('providencia'), false)
    assert.equal(lido.texto.includes('solucao'), false)
  }
})

test('nome longo e vários equipamentos quebram a página sem perder texto', async () => {
  const nomeLongo = 'Aparelho de musculação com identificação complementar muito longa para conferir a quebra de linha sem perder acentos: ação, coração e manutenção'
  const nomes = Array.from({ length: 48 }, (_, indice) => `Equipamento de exemplo ${String(indice + 1).padStart(2, '0')}`)
  nomes[10] = nomeLongo
  const preparado = prepararComprovante(visita({
    condominio: 'Residencial Parque das Acácias com nome complementar de exemplo para ocupar mais de uma linha no comprovante',
    prestador: 'João Carlos de Albuquerque e Sá',
    equipamentos: nomes.map((nome) => ({ nome })),
  }))
  assert.ok(preparado.comprovante)
  const gerado = await gerarPdfComprovante(preparado.comprovante, recursos)
  assert.equal(gerado.erro, null)
  assert.ok(gerado.pdf)
  const lido = await lerPdf(gerado.pdf)
  assert.ok(lido.paginas.length > 1)
  const texto = junto(lido.texto)
  assert.equal(texto.includes(junto(nomeLongo)), true)
  assert.equal(texto.includes(junto('Residencial Parque das Acácias com nome complementar de exemplo para ocupar mais de uma linha no comprovante')), true)
  assert.equal(texto.includes(junto('João Carlos de Albuquerque e Sá')), true)
  assert.equal(junto(lido.paginas[1]).includes('ELEVA'), true)
  for (const nome of nomes) assert.equal(texto.includes(junto(nome)), true, nome)
  assert.equal(junto(lido.paginas[1]).includes('VISITA2/12'), true)
  assert.equal(lido.texto.includes('SEGREDO'), false)
})

test('palavra sem espaço permanece inteira depois da quebra', async () => {
  const documento = await PDFDocument.create()
  documento.registerFontkit((await import('@pdf-lib/fontkit')).default)
  const fonte = await documento.embedFont(recursos.fonteTexto, {
    subset: true,
    features: { liga: false, clig: false, dlig: false, calt: false },
  })
  const palavra = 'Supercalifragilisticoespialidoso'
  const linhas = quebrarTexto(fonte, palavra, 12, 80)
  assert.ok(linhas.length > 1)
  assert.equal(linhas.join(''), palavra)
  for (const linha of linhas) assert.ok(fonte.widthOfTextAtSize(linha, 12) <= 80)
})

test('PDF recusa título antigo, equipamento com ocorrência e logo ausente', async () => {
  const preparado = prepararComprovante(visita())
  assert.ok(preparado.comprovante)
  const fraseAntiga = await gerarPdfComprovante({
    ...preparado.comprovante,
    titulo: 'MANUTENÇÃO 7 DE 12 — REALIZADA EM 10/10/2026',
  }, recursos)
  assert.equal(fraseAntiga.pdf, null)
  assert.equal(fraseAntiga.erro, 'O comprovante não pôde ser gerado.')

  const equipamentoSujo = await gerarPdfComprovante({
    ...preparado.comprovante,
    equipamentos: [{ nome: 'Elíptico', descricao: 'SEGREDO-DESCRICAO' } as unknown as string],
  }, recursos)
  assert.equal(equipamentoSujo.pdf, null)

  const semLogo = await gerarPdfComprovante(preparado.comprovante, {
    ...recursos,
    logo: new Uint8Array(),
  })
  assert.equal(semLogo.pdf, null)
})

test('o logo oficial entra no arquivo', async () => {
  assert.equal(recursos.logo[0], 0x89)
  assert.equal(Buffer.from(recursos.logo.subarray(1, 4)).toString(), 'PNG')
  const preparado = prepararComprovante(visita())
  assert.ok(preparado.comprovante)
  const oficial = await gerarPdfComprovante(preparado.comprovante, recursos)
  const outro = await gerarPdfComprovante(preparado.comprovante, { ...recursos, logo: PNG_MINIMO })
  assert.ok(oficial.pdf)
  assert.ok(outro.pdf)
  assert.equal(Buffer.from(oficial.pdf).equals(Buffer.from(outro.pdf)), false)
})
