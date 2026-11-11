import { hojeIso, idValido } from '@/lib/cadastros'
import { rotuloVisita } from '@/lib/contratos'
import { rotuloManutencao } from '@/lib/manutencoes'

export const CATEGORIAS_BIBLIOTECA = ['manutencoes', 'confirmacoes', 'ocorrencias'] as const

export type CategoriaBiblioteca = (typeof CATEGORIAS_BIBLIOTECA)[number]

export type VisitaBiblioteca = {
  id: string
  tipo: string
  numeroVisita: number | null
  quantidadeVisitas: number | null
  dataProgramada: string
  dataEfetiva: string | null
  status: string
  registroAnterior: boolean
}

export type ClasseDocumentoBiblioteca = 'comprovante' | 'confirmacao' | 'declaracao'

export type DocumentoBiblioteca = {
  manutencaoId: string
  classe: ClasseDocumentoBiblioteca
  codigo: string | null
  caminho: string
}

export type BibliotecaCondominio = {
  visitas: VisitaBiblioteca[]
  documentos: DocumentoBiblioteca[]
}

export type LinhaDocumento = {
  rotulo: string
  href: string
  codigo: string | null
}

export type GrupoDocumento = {
  manutencaoId: string
  titulo: string
  data: string
  documentos: LinhaDocumento[]
}

const CODIGO = /^CM-\d{4}-\d{6}(-D)?$/
const DATA = /^\d{4}-\d{2}-\d{2}$/
const SEGREDO = /token|cifrado|whatsapp|senha|pdf_url/i

export function anoBiblioteca(valor: string | undefined, agora = new Date()) {
  if (valor && /^\d{4}$/.test(valor)) {
    const numero = Number(valor)
    if (numero >= 2000 && numero <= 2100) return valor
  }
  return hojeIso(agora).slice(0, 4)
}

export function categoriaBiblioteca(valor: string | undefined): CategoriaBiblioteca {
  if (valor === 'confirmacoes' || valor === 'ocorrencias') return valor
  return 'manutencoes'
}

export function anoEfetivo(data: string | null | undefined) {
  if (!data || !DATA.test(data.slice(0, 10))) return null
  return data.slice(0, 4)
}

export function hrefDocumento(documento: DocumentoBiblioteca) {
  const id = documento.manutencaoId.toLowerCase()
  if (documento.classe === 'comprovante') return `/adm/manutencoes/${id}/comprovante`
  return `/adm/manutencoes/${id}/confirmacao?codigo=${documento.codigo}`
}

export function rotuloDocumento(documento: DocumentoBiblioteca) {
  if (documento.classe === 'comprovante') return 'Comprovante de execução'
  if (documento.classe === 'declaracao') return `Declaração de correção ${documento.codigo}`
  return `Confirmação de recebimento ${documento.codigo}`
}

export function listarVisitas(visitas: VisitaBiblioteca[]) {
  return [...visitas].sort((a, b) => {
    const data = b.dataProgramada.localeCompare(a.dataProgramada)
    if (data !== 0) return data
    return a.id.localeCompare(b.id)
  })
}

export function consultaDocumentos(
  biblioteca: BibliotecaCondominio,
  ano: string,
  categoria: CategoriaBiblioteca,
) {
  const visitas = new Map(biblioteca.visitas.map((visita) => [visita.id, visita]))
  const anos = new Set<string>()
  const grupos = new Map<string, GrupoDocumento>()
  const ordem: Record<DocumentoBiblioteca['classe'], number> = { comprovante: 0, confirmacao: 1, declaracao: 2 }
  const documentos = [...biblioteca.documentos].sort((a, b) => {
    const peso = ordem[a.classe] - ordem[b.classe]
    if (peso !== 0) return peso
    return (a.codigo ?? '').localeCompare(b.codigo ?? '')
  })

  for (const documento of documentos) {
    const visita = visitas.get(documento.manutencaoId)
    const anoVisita = anoEfetivo(visita?.dataEfetiva)
    if (!visita || !anoVisita || !documentoAceito(documento)) continue
    anos.add(anoVisita)
    if (categoria === 'ocorrencias' || anoVisita !== ano) continue
    if (categoria === 'confirmacoes' && documento.classe === 'comprovante') continue

    const grupo = grupos.get(visita.id) ?? {
      manutencaoId: visita.id,
      titulo: rotuloManutencao(visita.tipo, visita.numeroVisita, visita.quantidadeVisitas),
      data: visita.dataEfetiva ?? '',
      documentos: [],
    }
    grupo.documentos.push({
      rotulo: rotuloDocumento(documento),
      href: hrefDocumento(documento),
      codigo: documento.codigo,
    })
    grupos.set(visita.id, grupo)
  }

  const lista = [...grupos.values()].sort((a, b) => {
    const data = b.data.localeCompare(a.data)
    if (data !== 0) return data
    return a.manutencaoId.localeCompare(b.manutencaoId)
  })

  return {
    anos: [...anos].sort((a, b) => b.localeCompare(a)),
    grupos: categoria === 'confirmacoes'
      ? lista.map((grupo) => ({
          ...grupo,
          documentos: grupo.documentos.filter((linha) => linha.codigo),
        })).filter((grupo) => grupo.documentos.length > 0)
      : lista,
  }
}

export function tituloVisita(visita: VisitaBiblioteca) {
  if (visita.tipo === 'preventiva' && visita.numeroVisita && visita.quantidadeVisitas) {
    return rotuloVisita(visita.numeroVisita, visita.quantidadeVisitas)
  }
  return rotuloManutencao(visita.tipo, visita.numeroVisita, visita.quantidadeVisitas)
}

export function bibliotecaCondominio(bruto: unknown): BibliotecaCondominio | null {
  if (temSegredo(bruto)) return null
  const dados = objeto(bruto)
  if (!dados || !Array.isArray(dados.visitas) || !Array.isArray(dados.documentos)) return null
  if (Object.keys(dados).some((chave) => chave !== 'visitas' && chave !== 'documentos')) return null

  const visitas: VisitaBiblioteca[] = []
  for (const item of dados.visitas) {
    const visita = visitaBiblioteca(item)
    if (!visita) return null
    visitas.push(visita)
  }

  const documentos: DocumentoBiblioteca[] = []
  for (const item of dados.documentos) {
    const documento = documentoBiblioteca(item)
    if (!documento) return null
    documentos.push(documento)
  }

  return { visitas, documentos }
}

function documentoAceito(documento: DocumentoBiblioteca) {
  const id = documento.manutencaoId.toLowerCase()
  if (!idValido(id) || documento.caminho.includes('..') || documento.caminho.includes('\\') || documento.caminho.includes('://')) {
    return false
  }
  if (documento.classe === 'comprovante') {
    return documento.codigo === null && documento.caminho === `${id}/comprovante.pdf`
  }
  if (!documento.codigo || !CODIGO.test(documento.codigo)) return false
  if (documento.classe === 'declaracao' && !documento.codigo.endsWith('-D')) return false
  if (documento.classe === 'confirmacao' && documento.codigo.endsWith('-D')) return false
  return documento.caminho === `${id}/confirmacoes/${documento.codigo}.pdf`
}

function visitaBiblioteca(bruto: unknown): VisitaBiblioteca | null {
  const dados = objeto(bruto)
  if (!dados) return null
  const id = texto(dados.id).toLowerCase()
  const tipo = texto(dados.tipo)
  const dataProgramada = texto(dados.data_programada).slice(0, 10)
  const efetiva = dados.data_efetiva == null ? null : texto(dados.data_efetiva).slice(0, 10)
  const status = texto(dados.status)
  if (!idValido(id) || !DATA.test(dataProgramada) || (efetiva !== null && !DATA.test(efetiva))) return null
  if (!['preventiva', 'corretiva', 'corretiva_complementar', 'avulsa'].includes(tipo)) return null
  if (!['programada', 'em_execucao', 'aguardando_administracao', 'realizada', 'cancelada'].includes(status)) return null
  const numero = numeroOpcional(dados.numero_visita)
  const quantidade = numeroOpcional(dados.quantidade_visitas)
  if (numero === undefined || quantidade === undefined) return null
  if (typeof dados.registro_anterior !== 'boolean') return null
  return {
    id,
    tipo,
    numeroVisita: numero,
    quantidadeVisitas: quantidade,
    dataProgramada,
    dataEfetiva: efetiva,
    status,
    registroAnterior: dados.registro_anterior,
  }
}

function documentoBiblioteca(bruto: unknown): DocumentoBiblioteca | null {
  const dados = objeto(bruto)
  if (!dados) return null
  const manutencaoId = texto(dados.manutencao_id).toLowerCase()
  const classe = texto(dados.classe)
  const caminho = texto(dados.caminho)
  const codigo = dados.codigo == null ? null : texto(dados.codigo)
  if (!idValido(manutencaoId) || !caminho) return null
  if (classe !== 'comprovante' && classe !== 'confirmacao' && classe !== 'declaracao') return null
  return { manutencaoId, classe, codigo, caminho }
}

function numeroOpcional(valor: unknown) {
  if (valor == null) return null
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1) return undefined
  return valor
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor : ''
}

function objeto(valor: unknown): Record<string, unknown> | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null
  return valor as Record<string, unknown>
}

function temSegredo(valor: unknown): boolean {
  if (!valor || typeof valor !== 'object') return false
  for (const [chave, item] of Object.entries(valor)) {
    if (SEGREDO.test(chave)) return true
    if (temSegredo(item)) return true
  }
  return false
}
