import { dataHumana, idValido } from '@/lib/cadastros'
import { tituloComprovante } from '@/lib/comprovante'
import { dataHoraHumana } from '@/lib/manutencoes'
import type { PapelDestinatario } from '@/lib/confirmacao-sindico'

export const LIMITE_JUSTIFICATIVA_CONFIRMACAO = 400

export const AVISO_CONFIRMACAO_PDF =
  'Este documento registra a confirmação de recebimento do comprovante. Não equivale a assinatura eletrônica nem a aprovação técnica do serviço.'

export const AVISO_DECLARACAO_PDF =
  'Este documento registra a correção administrativa de uma confirmação de recebimento anteriormente lançada. A confirmação original permanece preservada para fins de histórico, mas não possui validade atual. Esta declaração não constitui uma nova confirmação de recebimento.'

export const TITULO_CONFIRMACAO_PDF = 'CONFIRMAÇÃO DE RECEBIMENTO'
export const TITULO_DECLARACAO_PDF = 'DECLARAÇÃO DE CORREÇÃO'
export const ROTULO_SEM_VALIDADE = 'Sem validade atual'

const CODIGO = /^CM-\d{4}-\d{6}(-D)?$/

export function justificativaConfirmacao(valor: string) {
  const texto = valor.trim()
  if (!texto || texto.includes('\u0000')) return { erro: 'Informe a justificativa da confirmação.', texto: null }
  if (texto.length > LIMITE_JUSTIFICATIVA_CONFIRMACAO) {
    return { erro: 'A justificativa da confirmação precisa caber em 400 caracteres.', texto: null }
  }
  return { erro: null, texto }
}

export function codigoDocumentoValido(codigo: string) {
  return CODIGO.test(codigo)
}

export function caminhoDocumentoConfirmacao(manutencaoId: string, codigo: string) {
  if (!idValido(manutencaoId) || !codigoDocumentoValido(codigo)) return null
  const caminho = `${manutencaoId.toLowerCase()}/confirmacoes/${codigo}.pdf`
  if (caminho.includes('comprovante.pdf') || caminho.includes('..') || caminho.includes('\\') || caminho.includes('://')) return null
  return caminho
}

export type OrigemConfirmacaoVigente = 'link' | 'manual'

export type LinhaConfirmacaoManual = {
  registroId: string
  registradoEm: string
  responsavel: string
  justificativa: string
  destinatarioNome: string
  destinatarioPapel: PapelDestinatario
  codigo: string | null
  correcaoEm: string | null
  correcaoResponsavel: string | null
  correcaoJustificativa: string | null
  declaracaoCodigo: string | null
}

export type ResumoConfirmacaoManual = {
  podeRegistrar: boolean
  origemVigente: OrigemConfirmacaoVigente | null
  vigenteEm: string | null
  vigenteResponsavel: string | null
  vigentePapel: PapelDestinatario | null
  vigenteJustificativa: string | null
  vigenteRegistroId: string | null
  vigenteDestinatario: string | null
  vigenteCodigo: string | null
  historico: LinhaConfirmacaoManual[]
}

export type DocumentoConfirmacao = {
  codigo: string
  caminho: string
  classe: 'confirmacao' | 'declaracao'
  origem: 'link' | 'manual' | null
  condominio: string
  tituloManutencao: string
  dataManutencao: string
  ocorridoEm: string
  responsavel: string
  papel: PapelDestinatario | null
  destinatarioNome: string | null
  destinatarioPapel: PapelDestinatario | null
  justificativa: string | null
  codigoOrigem: string | null
}

export type GarantiaDocumento = {
  codigo: string
  caminho: string
  declaracaoCodigo: string | null
  declaracaoCaminho: string | null
}

function objeto(valor: unknown) {
  if (typeof valor === 'string') {
    try {
      return JSON.parse(valor) as unknown
    } catch {
      return null
    }
  }
  return valor && typeof valor === 'object' ? valor : null
}

function registro(valor: unknown) {
  return valor && typeof valor === 'object' ? valor as Record<string, unknown> : null
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : ''
}

function papel(valor: unknown): PapelDestinatario | null {
  const nome = texto(valor)
  if (nome === 'sindico' || nome === 'gerente' || nome === 'conselheiro' || nome === 'administradora' || nome === 'outro') return nome
  return null
}

function inteiro(valor: unknown) {
  if (typeof valor === 'number' && Number.isInteger(valor)) return valor
  if (typeof valor === 'string' && /^-?\d+$/.test(valor)) return Number(valor)
  return null
}

function segredo(dados: Record<string, unknown>) {
  return 'token' in dados || 'token_hash' in dados || 'cifrado' in dados || 'whatsapp' in dados || 'pdf_url' in dados
}

export function resumoConfirmacaoManual(bruto: unknown): ResumoConfirmacaoManual | null {
  const dados = registro(objeto(bruto))
  if (!dados || typeof dados.pode_registrar !== 'boolean' || !Array.isArray(dados.historico) || segredo(dados)) return null
  const origem = dados.origem_vigente
  if (origem !== null && origem !== 'link' && origem !== 'manual') return null
  const historico: LinhaConfirmacaoManual[] = []
  for (const item of dados.historico) {
    const linha = registro(item)
    if (!linha || segredo(linha)) return null
    const registroId = texto(linha.registro_id)
    const papelLinha = papel(linha.destinatario_papel)
    const codigo = texto(linha.codigo)
    const declaracao = texto(linha.declaracao_codigo)
    if (!idValido(registroId) || !texto(linha.registrado_em) || !texto(linha.responsavel) || !texto(linha.justificativa) || !texto(linha.destinatario_nome) || !papelLinha) return null
    if (codigo && !codigoDocumentoValido(codigo)) return null
    if (declaracao && !codigoDocumentoValido(declaracao)) return null
    historico.push({
      registroId,
      registradoEm: texto(linha.registrado_em),
      responsavel: texto(linha.responsavel),
      justificativa: texto(linha.justificativa),
      destinatarioNome: texto(linha.destinatario_nome),
      destinatarioPapel: papelLinha,
      codigo: codigo || null,
      correcaoEm: texto(linha.correcao_em) || null,
      correcaoResponsavel: texto(linha.correcao_responsavel) || null,
      correcaoJustificativa: texto(linha.correcao_justificativa) || null,
      declaracaoCodigo: declaracao || null,
    })
  }
  const vigenteRegistro = texto(dados.vigente_registro_id)
  const vigenteCodigo = texto(dados.vigente_codigo)
  if (vigenteRegistro && !idValido(vigenteRegistro)) return null
  if (vigenteCodigo && !codigoDocumentoValido(vigenteCodigo)) return null
  return {
    podeRegistrar: dados.pode_registrar,
    origemVigente: origem,
    vigenteEm: texto(dados.vigente_em) || null,
    vigenteResponsavel: texto(dados.vigente_responsavel) || null,
    vigentePapel: papel(dados.vigente_papel),
    vigenteJustificativa: texto(dados.vigente_justificativa) || null,
    vigenteRegistroId: vigenteRegistro || null,
    vigenteDestinatario: texto(dados.vigente_destinatario) || null,
    vigenteCodigo: vigenteCodigo || null,
    historico,
  }
}

export function garantiaDocumento(bruto: unknown): GarantiaDocumento | null {
  const dados = registro(objeto(bruto))
  if (!dados || segredo(dados)) return null
  const codigo = texto(dados.codigo)
  const caminho = texto(dados.caminho)
  const declaracaoCodigo = texto(dados.declaracao_codigo)
  const declaracaoCaminho = texto(dados.declaracao_caminho)
  if (!codigoDocumentoValido(codigo) || !caminho || caminho.includes('comprovante.pdf')) return null
  if (declaracaoCodigo && (!codigoDocumentoValido(declaracaoCodigo) || declaracaoCodigo !== `${codigo}-D`)) return null
  if (declaracaoCaminho.includes('comprovante.pdf')) return null
  return {
    codigo,
    caminho,
    declaracaoCodigo: declaracaoCodigo || null,
    declaracaoCaminho: declaracaoCaminho || null,
  }
}

export function documentoConfirmacao(bruto: unknown): DocumentoConfirmacao | null {
  const dados = registro(objeto(bruto))
  if (!dados || segredo(dados)) return null
  const codigo = texto(dados.codigo)
  const caminho = texto(dados.caminho)
  const classe = texto(dados.classe)
  const origem = dados.origem
  if (!codigoDocumentoValido(codigo) || caminhoDocumentoConfirmacao(caminho.split('/')[0] ?? '', codigo) !== caminho) return null
  if (classe !== 'confirmacao' && classe !== 'declaracao') return null
  if (origem !== null && origem !== 'link' && origem !== 'manual') return null
  if (classe === 'declaracao' && (origem !== null || !codigo.endsWith('-D'))) return null
  if (classe === 'confirmacao' && codigo.endsWith('-D')) return null
  const titulo = tituloComprovante(texto(dados.tipo), inteiro(dados.numero_visita), inteiro(dados.quantidade_visitas))
  const dataManutencao = dataHumana(texto(dados.data_manutencao))
  const ocorridoEm = dataHoraHumana(texto(dados.ocorrido_em))
  const condominio = texto(dados.condominio)
  const responsavel = texto(dados.responsavel)
  const codigoOrigem = texto(dados.codigo_origem)
  const justificativa = texto(dados.justificativa)
  if (!titulo || !dataManutencao || !ocorridoEm || !condominio || !responsavel) return null
  if (classe === 'declaracao' && (!codigoOrigem || codigo !== `${codigoOrigem}-D` || !justificativa)) return null
  if (origem === 'manual' && !justificativa) return null
  if (origem === 'link' && justificativa) return null
  return {
    codigo,
    caminho,
    classe,
    origem,
    condominio,
    tituloManutencao: titulo,
    dataManutencao,
    ocorridoEm,
    responsavel,
    papel: papel(dados.papel),
    destinatarioNome: texto(dados.destinatario_nome) || null,
    destinatarioPapel: papel(dados.destinatario_papel),
    justificativa: justificativa || null,
    codigoOrigem: codigoOrigem || null,
  }
}
