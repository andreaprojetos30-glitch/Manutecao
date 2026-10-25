import { readFile } from 'node:fs/promises'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { IDENTIFICACAO_ELEVA, LIMITE_OBSERVACAO_ADMINISTRACAO, type Comprovante } from '@/lib/comprovante'

export const COR_VERDE = '#1e3a2b'
export const COR_DOURADO = '#b08d57'
export const COR_FUNDO = '#f3f0ea'

const COR_TINTA = '#1c1c1c'
const LIMITE_TEXTO = 400
const LIMITE_EQUIPAMENTOS = 150
const LARGURA = 595.28
const ALTURA = 841.89
const MARGEM = 48
const BASE = 64
const CONTEUDO = LARGURA - MARGEM * 2
const HEADER = 108
const FAIXA = 4

const ROTULO_CONDOMINIO = 'Condomínio'
const ROTULO_DATA = 'Data efetiva'
const ROTULO_PRESTADOR = 'Prestador'
const ROTULO_EQUIPAMENTOS = 'Equipamentos atendidos'
const ROTULO_OBSERVACAO = 'Observação da administração'
const ROTULO_FAIXA = 'MANUTENÇÃO'

const FONTE = {
  subset: true,
  features: { liga: false, clig: false, dlig: false, calt: false },
} as const

function cor(hex: string) {
  const valor = Number.parseInt(hex.slice(1), 16)
  return rgb(((valor >> 16) & 255) / 255, ((valor >> 8) & 255) / 255, (valor & 255) / 255)
}

const VERDE = cor(COR_VERDE)
const DOURADO = cor(COR_DOURADO)
const FUNDO = cor(COR_FUNDO)
const TINTA = cor(COR_TINTA)

export type RecursosPdfComprovante = {
  logo: Uint8Array
  fonteTitulo: Uint8Array
  fonteTexto: Uint8Array
  fonteRotulo: Uint8Array
}

export function tituloPdfPermitido(titulo: string) {
  if (titulo === 'MANUTENÇÃO AVULSA' || titulo === 'MANUTENÇÃO CORRETIVA' || titulo === 'RETORNO TÉCNICO') return true
  const encontrado = /^VISITA ([1-9]\d{0,3})\/([1-9]\d{0,3})$/.exec(titulo)
  if (!encontrado) return false
  return Number(encontrado[1]) <= Number(encontrado[2])
}

function textoAceito(valor: unknown): valor is string {
  return typeof valor === 'string'
    && valor.length > 0
    && valor.length <= LIMITE_TEXTO
    && valor === valor.trim()
    && !/[\u0000-\u001F\u007F]/.test(valor)
}

export function fecharComprovante(entrada: Comprovante | null | undefined): Comprovante | null {
  if (!entrada || typeof entrada !== 'object') return null
  const { identificacao, titulo, condominio, dataEfetiva, prestador, equipamentos, observacaoAdministracao } = entrada
  if (identificacao !== IDENTIFICACAO_ELEVA || typeof titulo !== 'string' || !tituloPdfPermitido(titulo)) return null
  if (!textoAceito(condominio) || !textoAceito(prestador) || !textoAceito(dataEfetiva)) return null
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dataEfetiva)) return null
  if (!Array.isArray(equipamentos) || equipamentos.length === 0 || equipamentos.length > LIMITE_EQUIPAMENTOS) return null
  if (observacaoAdministracao !== null && observacaoAdministracao !== undefined && !textoAceito(observacaoAdministracao)) return null
  if (typeof observacaoAdministracao === 'string' && observacaoAdministracao.length > LIMITE_OBSERVACAO_ADMINISTRACAO) return null

  const nomes: string[] = []
  for (const nome of equipamentos) {
    if (!textoAceito(nome)) return null
    nomes.push(nome)
  }

  return {
    identificacao: IDENTIFICACAO_ELEVA,
    titulo,
    condominio,
    dataEfetiva,
    prestador,
    equipamentos: nomes,
    observacaoAdministracao: observacaoAdministracao ?? null,
  }
}

export function quebrarTexto(fonte: PDFFont, texto: string, tamanho: number, largura: number) {
  const linhas: string[] = []
  let atual = ''
  const cabe = (valor: string) => valor.length === 0 || fonte.widthOfTextAtSize(valor, tamanho) <= largura

  function partir(palavra: string) {
    if (cabe(palavra)) return palavra
    let pedaco = ''
    for (const caractere of Array.from(palavra)) {
      const proximo = pedaco + caractere
      if (pedaco && !cabe(proximo)) {
        linhas.push(pedaco)
        pedaco = caractere
      } else {
        pedaco = proximo
      }
    }
    return pedaco
  }

  for (const palavra of texto.split(' ')) {
    if (!atual) {
      atual = partir(palavra)
      continue
    }
    const candidata = `${atual} ${palavra}`
    if (cabe(candidata)) {
      atual = candidata
      continue
    }
    linhas.push(atual)
    atual = partir(palavra)
  }
  if (atual) linhas.push(atual)
  return linhas.length > 0 ? linhas : ['']
}

async function lerBytes(url: URL) {
  return new Uint8Array(await readFile(url))
}

export async function carregarRecursosComprovante(): Promise<RecursosPdfComprovante> {
  const [logo, fonteTitulo, fonteTexto, fonteRotulo] = await Promise.all([
    lerBytes(new URL('../public/logo-eleva.png', import.meta.url)),
    lerBytes(new URL('./fontes/CormorantGaramond-SemiBold.ttf', import.meta.url)),
    lerBytes(new URL('./fontes/Outfit-Regular.ttf', import.meta.url)),
    lerBytes(new URL('./fontes/Outfit-Medium.ttf', import.meta.url)),
  ])
  return { logo, fonteTitulo, fonteTexto, fonteRotulo }
}

export async function gerarPdfComprovante(
  entrada: Comprovante,
  recursos: RecursosPdfComprovante,
): Promise<{ erro: string; pdf: null } | { erro: null; pdf: Uint8Array }> {
  const comprovante = fecharComprovante(entrada)
  if (!comprovante || !recursos?.logo?.byteLength || !recursos.fonteTitulo?.byteLength || !recursos.fonteTexto?.byteLength || !recursos.fonteRotulo?.byteLength) {
    return { erro: 'O comprovante não pôde ser gerado.', pdf: null }
  }

  try {
    const doc = await PDFDocument.create()
    doc.registerFontkit(fontkit)
    const fonteTitulo = await doc.embedFont(recursos.fonteTitulo, FONTE)
    const fonteTexto = await doc.embedFont(recursos.fonteTexto, FONTE)
    const fonteRotulo = await doc.embedFont(recursos.fonteRotulo, FONTE)
    const logo = await doc.embedPng(recursos.logo)
    const pdf = await desenhar(doc, comprovante, { fonteTitulo, fonteTexto, fonteRotulo, logo })
    return { erro: null, pdf }
  } catch {
    return { erro: 'O comprovante não pôde ser gerado.', pdf: null }
  }
}

async function desenhar(
  doc: PDFDocument,
  comprovante: Comprovante,
  fontes: { fonteTitulo: PDFFont; fonteTexto: PDFFont; fonteRotulo: PDFFont; logo: PDFImage },
) {
  const { fonteTitulo, fonteTexto, fonteRotulo, logo } = fontes
  const estado: { pagina: PDFPage | null; cursor: number; rotuloAberto: string | null } = {
    pagina: null,
    cursor: 0,
    rotuloAberto: null,
  }

  function novaPagina(continuacao: boolean) {
    const folha = doc.addPage([LARGURA, ALTURA])
    estado.pagina = folha
    folha.drawRectangle({ x: 0, y: 0, width: LARGURA, height: ALTURA, color: FUNDO })
    folha.drawRectangle({ x: 0, y: ALTURA - HEADER, width: LARGURA, height: HEADER, color: VERDE })
    folha.drawRectangle({ x: 0, y: ALTURA - HEADER - FAIXA, width: LARGURA, height: FAIXA, color: DOURADO })

    const logoAltura = 54
    const logoLargura = (logo.width / logo.height) * logoAltura
    const logoY = ALTURA - HEADER + (HEADER - FAIXA - logoAltura) / 2
    folha.drawImage(logo, { x: MARGEM, y: logoY, width: logoLargura, height: logoAltura })

    const faixaLargura = fonteRotulo.widthOfTextAtSize(ROTULO_FAIXA, 11)
    folha.drawText(ROTULO_FAIXA, {
      x: LARGURA - MARGEM - faixaLargura,
      y: logoY + logoAltura / 2 - 4,
      size: 11,
      font: fonteRotulo,
      color: DOURADO,
    })

    folha.drawRectangle({ x: MARGEM, y: 42, width: CONTEUDO, height: 1.25, color: DOURADO })
    folha.drawText(comprovante.identificacao, {
      x: MARGEM,
      y: 24,
      size: 13,
      font: fonteTitulo,
      color: VERDE,
    })

    estado.cursor = ALTURA - HEADER - FAIXA - 36
    if (!continuacao) return

    for (const linha of quebrarTexto(fonteTitulo, comprovante.titulo, 16, CONTEUDO)) {
      folha.drawText(linha, { x: MARGEM, y: estado.cursor, size: 16, font: fonteTitulo, color: VERDE })
      estado.cursor -= 22
    }
    estado.cursor -= 8
    if (!estado.rotuloAberto) return
    folha.drawText(estado.rotuloAberto, { x: MARGEM, y: estado.cursor, size: 9, font: fonteRotulo, color: DOURADO })
    estado.cursor -= 16
  }

  function garantir(altura: number) {
    if (estado.cursor - altura < BASE) novaPagina(true)
  }

  function escreverValor(linhas: string[], tamanho: number, passo: number, recuo: number) {
    for (const linha of linhas) {
      garantir(passo)
      estado.pagina?.drawText(linha, { x: MARGEM + recuo, y: estado.cursor, size: tamanho, font: fonteTexto, color: TINTA })
      estado.cursor -= passo
    }
  }

  function campo(rotulo: string, valor: string) {
    const linhas = quebrarTexto(fonteTexto, valor, 13, CONTEUDO)
    garantir(16 + 18)
    estado.rotuloAberto = rotulo
    estado.pagina?.drawText(rotulo, { x: MARGEM, y: estado.cursor, size: 9, font: fonteRotulo, color: DOURADO })
    estado.cursor -= 16
    escreverValor(linhas, 13, 18, 0)
    estado.rotuloAberto = null
    estado.cursor -= 12
  }

  novaPagina(false)
  for (const linha of quebrarTexto(fonteTitulo, comprovante.titulo, 26, CONTEUDO)) {
    estado.pagina?.drawText(linha, { x: MARGEM, y: estado.cursor, size: 26, font: fonteTitulo, color: VERDE })
    estado.cursor -= 32
  }
  estado.cursor -= 2
  estado.pagina?.drawRectangle({ x: MARGEM, y: estado.cursor, width: 56, height: 2, color: DOURADO })
  estado.cursor -= 28

  campo(ROTULO_CONDOMINIO, comprovante.condominio)
  campo(ROTULO_DATA, comprovante.dataEfetiva)
  campo(ROTULO_PRESTADOR, comprovante.prestador)

  const nomes = comprovante.equipamentos.map((nome) => quebrarTexto(fonteTexto, nome, 12, CONTEUDO - 16))
  garantir(16 + 17)
  estado.rotuloAberto = ROTULO_EQUIPAMENTOS
  estado.pagina?.drawText(ROTULO_EQUIPAMENTOS, { x: MARGEM, y: estado.cursor, size: 9, font: fonteRotulo, color: DOURADO })
  estado.cursor -= 18
  for (const linhas of nomes) {
    linhas.forEach((linha, indice) => {
      garantir(17)
      if (indice === 0) {
        estado.pagina?.drawRectangle({ x: MARGEM, y: estado.cursor + 3, width: 4.5, height: 4.5, color: DOURADO })
      }
      estado.pagina?.drawText(linha, { x: MARGEM + 14, y: estado.cursor, size: 12, font: fonteTexto, color: TINTA })
      estado.cursor -= 17
    })
    estado.cursor -= 3
  }
  estado.rotuloAberto = null

  if (comprovante.observacaoAdministracao) {
    estado.cursor -= 4
    campo(ROTULO_OBSERVACAO, comprovante.observacaoAdministracao)
  }

  const total = doc.getPageCount()
  if (total > 1) {
    doc.getPages().forEach((folha, indice) => {
      const marca = `${indice + 1}/${total}`
      const largura = fonteTexto.widthOfTextAtSize(marca, 9)
      folha.drawText(marca, {
        x: LARGURA - MARGEM - largura,
        y: 26,
        size: 9,
        font: fonteTexto,
        color: DOURADO,
      })
    })
  }

  doc.setTitle(comprovante.titulo, { showInWindowTitleBar: true })
  doc.setAuthor(IDENTIFICACAO_ELEVA)
  doc.setCreator('ELEVA Manutenção')
  doc.setProducer('ELEVA Manutenção')
  doc.setLanguage('pt-BR')
  return doc.save()
}
