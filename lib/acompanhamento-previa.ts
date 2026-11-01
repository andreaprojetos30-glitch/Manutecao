import { PRAZO_CONFIRMACAO_MS, type FatoAcompanhamento } from '@/lib/acompanhamento-comprovante'

const HORA = 60 * 60 * 1000
const DIA = 24 * HORA

export function previaLocalPermitida(ambiente: { nodeEnv: string | undefined; supabaseUrl: string | undefined }) {
  if (ambiente.nodeEnv !== 'development') return false
  try {
    const endereco = new URL(ambiente.supabaseUrl ?? '')
    return endereco.hostname === '127.0.0.1' || endereco.hostname === 'localhost'
  } catch {
    return false
  }
}

export function cenariosPreviaAcompanhamento(agora: Date): FatoAcompanhamento[] {
  return [
    cenario(agora, {
      manutencaoId: 'f1c70000-0000-4000-8000-000000000001',
      condominioId: 'f1c70000-0000-4000-8000-000000000011',
      condominioNome: 'Condomínio Fictício Aurora',
      diasManutencao: 21,
      liberadoHa: 20 * DIA,
    }),
    cenario(agora, {
      manutencaoId: 'f1c70000-0000-4000-8000-000000000002',
      condominioId: 'f1c70000-0000-4000-8000-000000000012',
      condominioNome: 'Condomínio Fictício Sem Contato',
      diasManutencao: 4,
      liberadoHa: 3 * DIA,
      alertaWhatsapp: true,
    }),
    cenario(agora, {
      manutencaoId: 'f1c70000-0000-4000-8000-000000000003',
      condominioId: 'f1c70000-0000-4000-8000-000000000013',
      condominioNome: 'Condomínio Fictício 72 horas exatas',
      diasManutencao: 4,
      liberadoHa: 4 * DIA,
      primeiroEnvioHa: PRAZO_CONFIRMACAO_MS,
    }),
    cenario(agora, {
      manutencaoId: 'f1c70000-0000-4000-8000-000000000004',
      condominioId: 'f1c70000-0000-4000-8000-000000000014',
      condominioNome: 'Condomínio Fictício Quase 72 horas',
      diasManutencao: 4,
      liberadoHa: 4 * DIA,
      primeiroEnvioHa: 71 * HORA,
    }),
    cenario(agora, {
      manutencaoId: 'f1c70000-0000-4000-8000-000000000005',
      condominioId: 'f1c70000-0000-4000-8000-000000000015',
      condominioNome: 'Condomínio Fictício Com Lembrete',
      diasManutencao: 8,
      liberadoHa: 7 * DIA,
      primeiroEnvioHa: 6 * DIA,
      ultimoLembreteHa: 2 * DIA,
    }),
    cenario(agora, {
      manutencaoId: 'f1c70000-0000-4000-8000-000000000006',
      condominioId: 'f1c70000-0000-4000-8000-000000000016',
      condominioNome: 'Condomínio Fictício Sem Lembrete',
      diasManutencao: 6,
      liberadoHa: 5 * DIA,
      primeiroEnvioHa: 4 * DIA,
      alertaWhatsapp: true,
    }),
    cenario(agora, {
      manutencaoId: 'f1c70000-0000-4000-8000-000000000007',
      condominioId: 'f1c70000-0000-4000-8000-000000000017',
      condominioNome: 'Condomínio Fictício Confirmação Antiga',
      diasManutencao: 16,
      liberadoHa: 15 * DIA,
      primeiroEnvioHa: 14 * DIA,
      confirmadoHa: 12 * DIA,
    }),
    cenario(agora, {
      manutencaoId: 'f1c70000-0000-4000-8000-000000000008',
      condominioId: 'f1c70000-0000-4000-8000-000000000018',
      condominioNome: 'Condomínio Fictício Confirmação Recente',
      diasManutencao: 7,
      liberadoHa: 6 * DIA,
      primeiroEnvioHa: 5 * DIA,
      confirmadoHa: 1 * DIA,
    }),
  ]
}

function cenario(agora: Date, item: {
  manutencaoId: string
  condominioId: string
  condominioNome: string
  diasManutencao: number
  liberadoHa: number
  primeiroEnvioHa?: number
  ultimoLembreteHa?: number
  confirmadoHa?: number
  alertaWhatsapp?: boolean
}): FatoAcompanhamento {
  return {
    manutencaoId: item.manutencaoId,
    condominioId: item.condominioId,
    condominioNome: item.condominioNome,
    dataManutencao: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(agora.getTime() - item.diasManutencao * DIA)),
    liberadoEm: new Date(agora.getTime() - item.liberadoHa).toISOString(),
    confirmadoEm: item.confirmadoHa === undefined ? null : new Date(agora.getTime() - item.confirmadoHa).toISOString(),
    primeiroEnvioEm: item.primeiroEnvioHa === undefined ? null : new Date(agora.getTime() - item.primeiroEnvioHa).toISOString(),
    ultimoLembreteEm: item.ultimoLembreteHa === undefined ? null : new Date(agora.getTime() - item.ultimoLembreteHa).toISOString(),
    alertaWhatsapp: item.alertaWhatsapp ?? false,
  }
}
