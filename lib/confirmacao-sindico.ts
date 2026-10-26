import { randomBytes } from 'node:crypto'
import { idValido } from '@/lib/cadastros'
import { caminhoComprovante, pdfGerado } from '@/lib/comprovante-armazenamento'
import { IDENTIFICACAO_ELEVA, tituloComprovante } from '@/lib/comprovante'
import { dataValida } from '@/lib/contratos'

export function tokenConfirmacaoValido(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token)
}

export function novoTokenConfirmacao() {
  return randomBytes(32).toString('base64url')
}

export function linkConfirmacao(origem: string, token: string) {
  if (!tokenConfirmacaoValido(token)) return null
  const base = origem.replace(/\/$/, '')
  if (!base) return `/c/${token}`
  return `${base}/c/${token}`
}

export function origemConfirmacao(host: string, proto: string) {
  const limpo = host.split(',')[0]?.trim() ?? ''
  if (!limpo || /[\s/\\]/.test(limpo)) return ''
  const esquema = proto.split(',')[0]?.trim() === 'http' ? 'http' : 'https'
  return `${esquema}://${limpo}`
}

export type PaginaConfirmacao = {
  manutencaoId: string
  condominio: string
  titulo: string
  dataEfetiva: string
  caminhoPdf: string
  confirmadoEm: string | null
  sindicoNome: string | null
}

export type VistaPublica = {
  identificacao: typeof IDENTIFICACAO_ELEVA
  condominio: string
  titulo: string
  dataEfetiva: string
  confirmadoEm: string | null
}

export type ResumoConfirmacao = {
  linkAtivo: boolean
  emitidoEm: string | null
  confirmadoEm: string | null
  sindicoNome: string | null
  meio: 'link' | null
}

function objeto(valor: unknown) {
  if (typeof valor === 'string') {
    try {
      return JSON.parse(valor) as unknown
    } catch {
      return null
    }
  }
  return valor
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : ''
}

function inteiroOuNulo(valor: unknown) {
  if (typeof valor === 'number' && Number.isInteger(valor)) return valor
  if (typeof valor === 'string' && /^-?\d+$/.test(valor)) return Number(valor)
  return null
}

export function paginaDoLink(bruto: unknown): PaginaConfirmacao | null {
  const linha = objeto(bruto)
  if (!linha || typeof linha !== 'object') return null
  const dados = linha as Record<string, unknown>
  const manutencaoId = texto(dados.manutencao_id)
  if (!idValido(manutencaoId)) return null
  const condominio = texto(dados.condominio)
  if (!condominio) return null
  const titulo = tituloComprovante(
    texto(dados.tipo),
    inteiroOuNulo(dados.numero_visita),
    inteiroOuNulo(dados.quantidade_visitas),
  )
  if (!titulo) return null
  const dataEfetiva = texto(dados.data_efetiva).slice(0, 10)
  if (!dataValida(dataEfetiva)) return null
  const caminhoPdf = texto(dados.caminho_pdf)
  if (caminhoPdf !== caminhoComprovante(manutencaoId)) return null
  const confirmadoEm = texto(dados.confirmado_em) || null
  const sindicoNome = texto(dados.sindico_nome) || null
  if (confirmadoEm && !sindicoNome) return null
  if (confirmadoEm && dados.meio !== 'link') return null
  return {
    manutencaoId,
    condominio,
    titulo,
    dataEfetiva,
    caminhoPdf,
    confirmadoEm,
    sindicoNome: confirmadoEm ? sindicoNome : null,
  }
}

export function vistaPublica(pagina: PaginaConfirmacao): VistaPublica {
  return {
    identificacao: IDENTIFICACAO_ELEVA,
    condominio: pagina.condominio,
    titulo: pagina.titulo,
    dataEfetiva: pagina.dataEfetiva,
    confirmadoEm: pagina.confirmadoEm,
  }
}

export function resumoDoLink(bruto: unknown): ResumoConfirmacao | null {
  const linha = objeto(bruto)
  if (!linha || typeof linha !== 'object') return null
  const dados = linha as Record<string, unknown>
  if (typeof dados.link_ativo !== 'boolean') return null
  const meio = dados.meio === null || dados.meio === undefined ? null : dados.meio
  if (meio !== null && meio !== 'link') return null
  const confirmadoEm = texto(dados.confirmado_em) || null
  const sindicoNome = texto(dados.sindico_nome) || null
  if (confirmadoEm && (!sindicoNome || meio !== 'link')) return null
  return {
    linkAtivo: dados.link_ativo,
    emitidoEm: texto(dados.emitido_em) || null,
    confirmadoEm,
    sindicoNome: confirmadoEm ? sindicoNome : null,
    meio: confirmadoEm ? 'link' : null,
  }
}

function semSindico(mensagem: string) {
  return mensagem.includes('Não há síndico ativo')
}

function jaConfirmada(mensagem: string) {
  return mensagem.includes('já tem confirmação') || mensagem.includes('já foi registrada')
}

export async function executarConfirmacao(
  token: string,
  cliente: {
    ler(token: string): Promise<unknown>
    registrar(token: string): Promise<{ erro: string | null }>
  },
) {
  if (!tokenConfirmacaoValido(token)) return { estado: 'indisponivel' as const }
  const antes = paginaDoLink(await cliente.ler(token))
  if (!antes) return { estado: 'indisponivel' as const }
  if (antes.confirmadoEm) return { estado: 'ja_confirmada' as const, pagina: antes }
  const registro = await cliente.registrar(token)
  if (registro.erro) {
    if (semSindico(registro.erro)) return { estado: 'sem_sindico' as const }
    const depois = paginaDoLink(await cliente.ler(token))
    if (depois?.confirmadoEm && jaConfirmada(registro.erro)) {
      return { estado: 'ja_confirmada' as const, pagina: depois }
    }
    return { estado: 'indisponivel' as const }
  }
  const depois = paginaDoLink(await cliente.ler(token))
  if (!depois?.confirmadoEm) return { estado: 'indisponivel' as const }
  return { estado: 'confirmada' as const, pagina: depois }
}

export async function executarEmissao(entrada: {
  manutencaoId: string
  adminId: string
  origem: string
  gerarToken?: () => string
  emitir(manutencaoId: string, token: string, adminId: string): Promise<{ erro: string | null }>
  revogar(manutencaoId: string, adminId: string): Promise<{ erro: string | null }>
}): Promise<{ url: string } | { erro: string }> {
  if (!idValido(entrada.manutencaoId) || !idValido(entrada.adminId)) {
    return { erro: 'Sem permissão para esta alteração.' }
  }
  const token = (entrada.gerarToken ?? novoTokenConfirmacao)()
  if (!tokenConfirmacaoValido(token)) return { erro: 'Não foi possível gerar o link.' }
  const emissao = await entrada.emitir(entrada.manutencaoId, token, entrada.adminId)
  if (emissao.erro) return { erro: emissao.erro }
  const url = linkConfirmacao(entrada.origem, token)
  if (!url || url.toLowerCase().includes(entrada.manutencaoId.toLowerCase())) {
    await entrada.revogar(entrada.manutencaoId, entrada.adminId)
    return { erro: 'Não foi possível gerar o link.' }
  }
  return { url }
}

export async function entregarPdfDoLink(entrada: {
  token: string
  consultar(token: string): Promise<unknown>
  baixar(caminho: string): Promise<Uint8Array | null>
}) {
  if (!tokenConfirmacaoValido(entrada.token)) return null
  const pagina = paginaDoLink(await entrada.consultar(entrada.token))
  if (!pagina) return null
  const bytes = await entrada.baixar(pagina.caminhoPdf)
  if (!bytes || !pdfGerado(bytes)) return null
  return { bytes }
}

export async function bytesDeDownload(data: Blob | ArrayBuffer | Uint8Array | null) {
  if (!data) return null
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (typeof data.arrayBuffer === 'function') return new Uint8Array(await data.arrayBuffer())
  return null
}
