import { combinaBusca, idValido, termoBusca } from '@/lib/cadastros'

export const PRAZO_CONFIRMACAO_MS = 72 * 60 * 60 * 1000

export const SITUACOES_ACOMPANHAMENTO = [
  'aguardando_envio',
  'aguardando_confirmacao',
  'mais_de_3_dias',
  'confirmados',
] as const

export type SituacaoAcompanhamento = (typeof SITUACOES_ACOMPANHAMENTO)[number]

export type FatoAcompanhamento = {
  manutencaoId: string
  condominioId: string
  condominioNome: string
  dataManutencao: string
  liberadoEm: string
  confirmadoEm: string | null
  primeiroEnvioEm: string | null
  ultimoLembreteEm: string | null
  alertaWhatsapp: boolean
}

export type LinhaAcompanhamento = FatoAcompanhamento & {
  situacao: SituacaoAcompanhamento
  dias: number | null
}

export type FatosAcompanhamento =
  | { ativado: false }
  | { ativado: true; itens: FatoAcompanhamento[] }

export type FichaAcompanhamento =
  | { ativado: false }
  | { ativado: true; incluida: false; podeIncluir: boolean }
  | { ativado: true; incluida: true; podeIncluir: false; fato: FatoAcompanhamento }

const CHAVES_FATO = new Set([
  'manutencao_id',
  'condominio_id',
  'condominio_nome',
  'data_manutencao',
  'liberado_em',
  'confirmado_em',
  'primeiro_envio_em',
  'ultimo_lembrete_em',
  'alerta_whatsapp',
])

export function situacaoAcompanhamento(valor: string | undefined): SituacaoAcompanhamento | null {
  return SITUACOES_ACOMPANHAMENTO.find((item) => item === valor) ?? null
}

export function classificarAcompanhamento(
  fato: { confirmadoEm: string | null; primeiroEnvioEm: string | null },
  agora: Date,
) {
  if (fato.confirmadoEm) return 'confirmados' satisfies SituacaoAcompanhamento
  if (!fato.primeiroEnvioEm) return 'aguardando_envio' satisfies SituacaoAcompanhamento
  const inicio = Date.parse(fato.primeiroEnvioEm)
  const referencia = agora.getTime()
  if (!Number.isFinite(inicio) || !Number.isFinite(referencia)) return 'aguardando_envio'
  if (referencia - inicio <= PRAZO_CONFIRMACAO_MS) return 'aguardando_confirmacao'
  return 'mais_de_3_dias'
}

export function diasAguardando(primeiroEnvioEm: string, agora: Date) {
  const inicio = Date.parse(primeiroEnvioEm)
  const referencia = agora.getTime()
  if (!Number.isFinite(inicio) || !Number.isFinite(referencia) || referencia < inicio) return 0
  return Math.floor((referencia - inicio) / 86_400_000)
}

export function textoDiasAguardando(dias: number) {
  if (dias <= 0) return 'há menos de 1 dia'
  if (dias === 1) return 'há 1 dia'
  return `há ${dias} dias`
}

export function textoAlertaWhatsapp(temEnvioValido: boolean) {
  if (temEnvioValido) {
    return 'O prazo de confirmação continua. Novos envios ficam bloqueados até o contato ter um WhatsApp válido.'
  }
  return 'Sem WhatsApp válido. O envio fica bloqueado até atualizar o contato.'
}

export function rotuloSituacao(situacao: SituacaoAcompanhamento) {
  if (situacao === 'aguardando_envio') return 'Aguardando envio'
  if (situacao === 'aguardando_confirmacao') return 'Aguardando confirmação'
  if (situacao === 'mais_de_3_dias') return 'Mais de 3 dias'
  return 'Confirmados'
}

export function mensagemListaAcompanhamento(situacao: SituacaoAcompanhamento, busca: string, total: number) {
  if (total > 0) return null
  if (busca) return 'Nenhuma manutenção encontrada neste acompanhamento.'
  if (situacao === 'aguardando_envio') return 'Nenhuma manutenção aguardando envio.'
  if (situacao === 'aguardando_confirmacao') return 'Nenhuma manutenção aguardando confirmação.'
  if (situacao === 'mais_de_3_dias') return 'Nenhuma manutenção há mais de 3 dias.'
  return 'Nenhuma manutenção confirmada.'
}

export function montarListaAcompanhamento(entrada: {
  itens: FatoAcompanhamento[]
  agora: Date
  situacao: SituacaoAcompanhamento | null
  busca: string
}) {
  const classificadas = entrada.itens.map((fato) => linhaDe(fato, entrada.agora))
  const contagens = {
    aguardando_envio: classificadas.filter((linha) => linha.situacao === 'aguardando_envio').length,
    aguardando_confirmacao: classificadas.filter((linha) => linha.situacao === 'aguardando_confirmacao').length,
    mais_de_3_dias: classificadas.filter((linha) => linha.situacao === 'mais_de_3_dias').length,
    confirmados: classificadas.filter((linha) => linha.situacao === 'confirmados').length,
  }
  const busca = termoBusca(entrada.busca)
  const linhas = entrada.situacao
    ? classificadas
        .filter((linha) => linha.situacao === entrada.situacao && combinaBusca(busca, [linha.condominioNome]))
        .sort((a, b) => comparar(a, b))
    : []
  return { contagens, linhas, busca }
}

export function fatosAcompanhamento(bruto: unknown): FatosAcompanhamento | null {
  const dados = objeto(bruto)
  if (!dados || typeof dados.ativado !== 'boolean' || temSegredo(dados)) return null
  if (!dados.ativado) {
    if ('itens' in dados) return null
    return { ativado: false }
  }
  if (!Array.isArray(dados.itens)) return null
  const itens: FatoAcompanhamento[] = []
  for (const item of dados.itens) {
    const fato = fatoAcompanhamento(item)
    if (!fato) return null
    itens.push(fato)
  }
  return { ativado: true, itens }
}

export function fichaAcompanhamento(bruto: unknown): FichaAcompanhamento | null {
  const dados = objeto(bruto)
  if (!dados || typeof dados.ativado !== 'boolean' || temSegredo(dados)) return null
  if (!dados.ativado) {
    if ('incluida' in dados || 'pode_incluir' in dados || 'itens' in dados) return null
    return { ativado: false }
  }
  if (typeof dados.incluida !== 'boolean' || typeof dados.pode_incluir !== 'boolean') return null
  if (!dados.incluida) {
    if (dados.pode_incluir !== true && dados.pode_incluir !== false) return null
    return { ativado: true, incluida: false, podeIncluir: dados.pode_incluir }
  }
  if (dados.pode_incluir !== false) return null
  const fato = fatoAcompanhamento({
    manutencao_id: dados.manutencao_id,
    condominio_id: dados.condominio_id,
    condominio_nome: dados.condominio_nome,
    data_manutencao: dados.data_manutencao,
    liberado_em: dados.liberado_em,
    confirmado_em: dados.confirmado_em,
    primeiro_envio_em: dados.primeiro_envio_em,
    ultimo_lembrete_em: dados.ultimo_lembrete_em,
    alerta_whatsapp: dados.alerta_whatsapp,
  })
  if (!fato) return null
  return { ativado: true, incluida: true, podeIncluir: false, fato }
}

function linhaDe(fato: FatoAcompanhamento, agora: Date): LinhaAcompanhamento {
  const situacao = classificarAcompanhamento(fato, agora)
  const dias = situacao === 'aguardando_confirmacao' || situacao === 'mais_de_3_dias'
    ? diasAguardando(fato.primeiroEnvioEm ?? '', agora)
    : null
  return { ...fato, situacao, dias }
}

function comparar(a: LinhaAcompanhamento, b: LinhaAcompanhamento) {
  if (a.situacao === 'aguardando_envio') return compararTexto(a.liberadoEm, b.liberadoEm) || compararTexto(a.manutencaoId, b.manutencaoId)
  if (a.situacao === 'confirmados') {
    return compararTexto(b.confirmadoEm ?? '', a.confirmadoEm ?? '') || compararTexto(a.manutencaoId, b.manutencaoId)
  }
  return compararTexto(a.primeiroEnvioEm ?? '', b.primeiroEnvioEm ?? '') || compararTexto(a.manutencaoId, b.manutencaoId)
}

function compararTexto(a: string, b: string) {
  const esquerda = Date.parse(a)
  const direita = Date.parse(b)
  if (Number.isFinite(esquerda) && Number.isFinite(direita) && esquerda !== direita) return esquerda - direita
  return a < b ? -1 : a > b ? 1 : 0
}

function fatoAcompanhamento(bruto: unknown): FatoAcompanhamento | null {
  const dados = objeto(bruto)
  if (!dados || temSegredo(dados)) return null
  for (const chave of Object.keys(dados)) {
    if (!CHAVES_FATO.has(chave)) return null
  }
  const manutencaoId = texto(dados.manutencao_id)
  const condominioId = texto(dados.condominio_id)
  const condominioNome = texto(dados.condominio_nome)
  const dataManutencao = texto(dados.data_manutencao).slice(0, 10)
  const liberadoEm = texto(dados.liberado_em)
  if (!idValido(manutencaoId) || !idValido(condominioId) || !condominioNome || !/^\d{4}-\d{2}-\d{2}$/.test(dataManutencao)) return null
  if (!liberadoEm || Number.isNaN(Date.parse(liberadoEm)) || typeof dados.alerta_whatsapp !== 'boolean') return null
  const confirmadoEm = instante(dados.confirmado_em)
  const primeiroEnvioEm = instante(dados.primeiro_envio_em)
  const ultimoLembreteEm = instante(dados.ultimo_lembrete_em)
  if (confirmadoEm === undefined || primeiroEnvioEm === undefined || ultimoLembreteEm === undefined) return null
  return {
    manutencaoId,
    condominioId,
    condominioNome,
    dataManutencao,
    liberadoEm,
    confirmadoEm,
    primeiroEnvioEm,
    ultimoLembreteEm,
    alertaWhatsapp: dados.alerta_whatsapp,
  }
}

function instante(valor: unknown) {
  if (valor === null || valor === undefined) return null
  if (typeof valor !== 'string' || Number.isNaN(Date.parse(valor))) return undefined
  return valor
}

function objeto(valor: unknown) {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor as Record<string, unknown> : null
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : ''
}

const CHAVES_PROIBIDAS = new Set(['whatsapp', 'telefone', 'token', 'token_hash', 'cifrado', 'hash'])

function temSegredo(valor: unknown): boolean {
  if (Array.isArray(valor)) return valor.some((item) => temSegredo(item))
  if (!valor || typeof valor !== 'object') return false
  return Object.entries(valor).some(([chave, item]) => CHAVES_PROIBIDAS.has(chave) || temSegredo(item))
}
