import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFImage } from 'pdf-lib'
import { IDENTIFICACAO_ELEVA } from '@/lib/comprovante'
import { carregarRecursosComprovante, quebrarTexto, type RecursosPdfComprovante } from '@/lib/comprovante-pdf'
import {
  AVISO_CONFIRMACAO_PDF,
  AVISO_DECLARACAO_PDF,
  ROTULO_SEM_VALIDADE,
  TITULO_CONFIRMACAO_PDF,
  TITULO_DECLARACAO_PDF,
  type DocumentoConfirmacao,
} from '@/lib/confirmacao-manual'
import { rotuloPapelDestinatario } from '@/lib/destinatario-comprovante'

const VERDE = rgb(0x1e / 255, 0x3a / 255, 0x2b / 255)
const DOURADO = rgb(0xb0 / 255, 0x8d / 255, 0x57 / 255)
const FUNDO = rgb(0xf3 / 255, 0xf0 / 255, 0xea / 255)
const TINTA = rgb(0x1c / 255, 0x1c / 255, 0x1c / 255)
const LARGURA = 595.28
const ALTURA = 841.89
const MARGEM = 48
const CONTEUDO = LARGURA - MARGEM * 2

const FONTE = {
  subset: true,
  features: { liga: false, clig: false, dlig: false, calt: false },
} as const

export async function gerarPdfConfirmacao(
  documento: DocumentoConfirmacao,
  recursos: RecursosPdfComprovante,
) {
  if (!recursos.logo.byteLength || !recursos.fonteTitulo.byteLength || !recursos.fonteTexto.byteLength || !recursos.fonteRotulo.byteLength) {
    return { erro: 'O comprovante de confirmação não pôde ser gerado.', pdf: null }
  }
  try {
    const doc = await PDFDocument.create()
    doc.registerFontkit(fontkit)
    const fonteTitulo = await doc.embedFont(recursos.fonteTitulo, FONTE)
    const fonteTexto = await doc.embedFont(recursos.fonteTexto, FONTE)
    const fonteRotulo = await doc.embedFont(recursos.fonteRotulo, FONTE)
    const logo = await doc.embedPng(recursos.logo)
    const titulo = documento.classe === 'declaracao' ? TITULO_DECLARACAO_PDF : TITULO_CONFIRMACAO_PDF
    await desenhar(doc, documento, titulo, { fonteTitulo, fonteTexto, fonteRotulo, logo })
    doc.setTitle(titulo, { showInWindowTitleBar: true })
    doc.setAuthor(IDENTIFICACAO_ELEVA)
    doc.setCreator('ELEVA Manutenção')
    doc.setProducer('ELEVA Manutenção')
    doc.setLanguage('pt-BR')
    return { erro: null, pdf: await doc.save() }
  } catch {
    return { erro: 'O comprovante de confirmação não pôde ser gerado.', pdf: null }
  }
}

async function desenhar(
  doc: PDFDocument,
  documento: DocumentoConfirmacao,
  titulo: string,
  fontes: { fonteTitulo: PDFFont; fonteTexto: PDFFont; fonteRotulo: PDFFont; logo: PDFImage },
) {
  const { fonteTitulo, fonteTexto, fonteRotulo, logo } = fontes
  let folha = doc.addPage([LARGURA, ALTURA])
  let cursor = ALTURA - 148
  const logoAltura = 54
  const logoLargura = (logo.width / logo.height) * logoAltura

  function preparar(continuacao: boolean) {
    folha.drawRectangle({ x: 0, y: 0, width: LARGURA, height: ALTURA, color: FUNDO })
    folha.drawRectangle({ x: 0, y: ALTURA - 108, width: LARGURA, height: 108, color: VERDE })
    folha.drawRectangle({ x: 0, y: ALTURA - 112, width: LARGURA, height: 4, color: DOURADO })
    folha.drawImage(logo, { x: MARGEM, y: ALTURA - 86, width: logoLargura, height: logoAltura })
    folha.drawText(IDENTIFICACAO_ELEVA, { x: MARGEM, y: 28, size: 13, font: fonteTitulo, color: VERDE })
    cursor = continuacao ? ALTURA - 140 : ALTURA - 148
  }

  preparar(false)

  function linha(texto: string, tamanho: number, fonte: PDFFont, cor: typeof TINTA, passo: number) {
    for (const trecho of quebrarTexto(fonte, texto, tamanho, CONTEUDO)) {
      if (cursor < 64) {
        folha = doc.addPage([LARGURA, ALTURA])
        preparar(true)
      }
      folha.drawText(trecho, { x: MARGEM, y: cursor, size: tamanho, font: fonte, color: cor })
      cursor -= passo
    }
  }

  function campo(rotulo: string, valor: string) {
    linha(rotulo, 9, fonteRotulo, DOURADO, 14)
    linha(valor, 13, fonteTexto, TINTA, 18)
    cursor -= 8
  }

  linha(titulo, 22, fonteTitulo, VERDE, 28)
  cursor -= 4
  folha.drawRectangle({ x: MARGEM, y: cursor, width: 56, height: 2, color: DOURADO })
  cursor -= 22
  linha(documento.classe === 'declaracao' ? AVISO_DECLARACAO_PDF : AVISO_CONFIRMACAO_PDF, 11, fonteTexto, TINTA, 15)
  cursor -= 12
  campo('Condomínio', documento.condominio)
  campo('Manutenção', documento.tituloManutencao)
  campo('Data da manutenção', documento.dataManutencao)
  campo(documento.classe === 'declaracao' ? 'Data e hora da correção' : 'Data e hora da confirmação', documento.ocorridoEm)
  campo('Código do documento', documento.codigo)

  if (documento.classe === 'declaracao') {
    campo('Código original', documento.codigoOrigem ?? '')
    campo('Situação do documento original', ROTULO_SEM_VALIDADE)
    linha('Esta declaração não é uma nova confirmação válida.', 12, fonteTexto, TINTA, 16)
    cursor -= 8
    campo('Responsável pela correção', documento.responsavel)
    campo('Justificativa da correção', documento.justificativa ?? '')
    return
  }

  campo('Forma', documento.origem === 'manual' ? 'Registro manual pelo ADM' : 'Confirmação pelo link')
  campo(documento.origem === 'manual' ? 'Quem registrou' : 'Quem consta no registro', documento.responsavel)
  if (documento.origem === 'link') {
    linha('Nome copiado no momento da confirmação pelo link. Este registro não autentica a identidade de quem abriu o endereço.', 11, fonteTexto, TINTA, 15)
    cursor -= 8
  }
  if (documento.origem === 'manual' && documento.destinatarioNome) {
    campo('Destinatário autorizado naquele momento', `${documento.destinatarioNome}, ${rotuloPapelDestinatario(documento.destinatarioPapel)}`)
    campo('Justificativa', documento.justificativa ?? '')
  }
}
