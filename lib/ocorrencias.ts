import { idValido } from '@/lib/cadastros'
import { dataValida } from '@/lib/contratos'

export const SITUACOES_OCORRENCIA = [
  'aberta',
  'em_analise',
  'aguardando_orcamento',
  'aguardando_aprovacao',
  'aguardando_execucao',
  'retorno_programado',
  'resolvida',
] as const

export type SituacaoOcorrencia = (typeof SITUACOES_OCORRENCIA)[number]

const ROTULOS: Record<string, string> = {
  aberta: 'Aberta',
  em_analise: 'Em análise',
  aguardando_orcamento: 'Aguardando orçamento',
  aguardando_aprovacao: 'Aguardando aprovação do condomínio',
  aguardando_execucao: 'Aguardando execução',
  retorno_programado: 'Retorno técnico programado',
  aguardando_retorno: 'Aguardando retorno',
  resolvida: 'Resolvida',
  encerrada: 'Encerrada',
}

export function rotuloSituacaoOcorrencia(situacao: string) {
  return ROTULOS[situacao] ?? 'Acompanhamento'
}

export function situacaoOcorrencia(valor: string) {
  return SITUACOES_OCORRENCIA.includes(valor as SituacaoOcorrencia) ? (valor as SituacaoOcorrencia) : null
}

export function validarTratamento(situacao: string, observacao: string) {
  const escolhida = situacaoOcorrencia(situacao)
  const texto = observacao.replace(/\s+/g, ' ').trim()
  if (!escolhida) return { erro: 'Escolha a situação da ocorrência.', dados: null }
  if (!texto) {
    return {
      erro: escolhida === 'resolvida' ? 'Informe a solução adotada.' : 'Informe a observação ou a providência.',
      dados: null,
    }
  }
  if (texto.length > 2000) return { erro: 'O texto precisa caber em 2000 caracteres.', dados: null }
  return { erro: null, dados: { situacao: escolhida, observacao: texto } }
}

export function validarRetorno(data: string, prestadorId: string) {
  if (!dataValida(data)) return { erro: 'Informe a data.', dados: null }
  if (!idValido(prestadorId)) return { erro: 'Selecione o prestador.', dados: null }
  return { erro: null, dados: { data, prestadorId } }
}
