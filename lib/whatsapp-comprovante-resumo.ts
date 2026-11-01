import { idValido } from '@/lib/cadastros'

export type ClasseEnvio = 'envio' | 'lembrete' | 'correcao'
export type MotivoEnvio = 'sem_link' | 'encerrado' | 'confirmada' | 'sem_cifrado' | 'sem_whatsapp' | 'destinatario'

export type LinhaEnvio = {
  id: string
  classe: ClasseEnvio
  registradoEm: string
  responsavel: string
  correcaoEm: string | null
}

export type ResumoEnvio = {
  podePreparar: boolean
  motivo: MotivoEnvio | null
  historico: LinhaEnvio[]
}

const MOTIVOS = new Set<MotivoEnvio>(['sem_link', 'encerrado', 'confirmada', 'sem_cifrado', 'sem_whatsapp', 'destinatario'])

function objeto(valor: unknown) {
  return valor && typeof valor === 'object' ? valor as Record<string, unknown> : null
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : ''
}

function motivo(valor: unknown): MotivoEnvio | null {
  return typeof valor === 'string' && MOTIVOS.has(valor as MotivoEnvio) ? valor as MotivoEnvio : null
}

export function resumoEnvio(bruto: unknown): ResumoEnvio | null {
  const dados = objeto(bruto)
  if (!dados || typeof dados.pode_preparar !== 'boolean' || !Array.isArray(dados.historico)) return null
  if ('cifrado' in dados || 'token_hash' in dados || 'whatsapp' in dados || 'token' in dados) return null
  const historico: LinhaEnvio[] = []
  for (const item of dados.historico) {
    const linha = objeto(item)
    if (!linha) return null
    const classe = texto(linha.classe)
    if (classe !== 'envio' && classe !== 'lembrete' && classe !== 'correcao') return null
    const id = texto(linha.id)
    const registradoEm = texto(linha.registrado_em)
    const responsavel = texto(linha.responsavel)
    if (!idValido(id) || !registradoEm || !responsavel) return null
    if ('whatsapp' in linha || 'cifrado' in linha || 'token' in linha) return null
    historico.push({
      id,
      classe,
      registradoEm,
      responsavel,
      correcaoEm: texto(linha.correcao_em) || null,
    })
  }
  return {
    podePreparar: dados.pode_preparar,
    motivo: motivo(dados.motivo),
    historico,
  }
}

export function mensagemDoMotivo(codigo: MotivoEnvio | null) {
  if (codigo === 'sem_cifrado') return 'Este link foi emitido antes do envio por WhatsApp. Gere outro link para enviar.'
  if (codigo === 'sem_whatsapp') return 'Cadastre o WhatsApp de quem recebe os comprovantes.'
  if (codigo === 'destinatario') return 'Este link não pertence mais ao responsável autorizado.'
  if (codigo === 'encerrado') return 'O link desta manutenção já foi encerrado.'
  if (codigo === 'confirmada') return 'Esta manutenção já tem confirmação.'
  if (codigo === 'sem_link') return 'Não há link vigente para este comprovante.'
  return 'Não foi possível preparar a mensagem.'
}
