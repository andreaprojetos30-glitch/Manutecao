import { dataHumana, idValido } from '@/lib/cadastros'
import { dataValida, rotuloVisita } from '@/lib/contratos'

export const STATUS_VISITA = ['programada', 'em_execucao', 'aguardando_administracao', 'realizada', 'cancelada'] as const

export type StatusVisita = (typeof STATUS_VISITA)[number]

export type FiltroStatusVisita = StatusVisita | 'todos'

export type FiltroPrestador = 'todos' | 'sem' | string

export function filtroStatusVisita(valor: string | undefined): FiltroStatusVisita {
  if (valor && STATUS_VISITA.includes(valor as StatusVisita)) return valor as StatusVisita
  return 'todos'
}

export function filtroPrestadorVisita(valor: string | undefined): FiltroPrestador {
  if (valor === 'sem') return 'sem'
  if (valor && idValido(valor)) return valor
  return 'todos'
}

export function periodoVisitas(de: string | undefined, ate: string | undefined) {
  const inicio = (de ?? '').trim()
  const fim = (ate ?? '').trim()
  if (inicio && !dataValida(inicio)) return { erro: 'Informe a data inicial.', inicio: '', fim: '' }
  if (fim && !dataValida(fim)) return { erro: 'Informe a data final.', inicio: '', fim: '' }
  if (inicio && fim && inicio > fim) return { erro: 'A data inicial precisa ser anterior ou igual à final.', inicio, fim }
  return { erro: null, inicio, fim }
}

export function visitaAtrasada(status: string, data: string, hoje: string) {
  return status === 'programada' && data.slice(0, 10) < hoje
}

export function fraseManutencaoPdf(tipo: string, numero: number | null, total: number | null, dataRealizada: string | null) {
  if (tipo !== 'preventiva' || !numero || numero < 1 || !total || total < 1) return null
  const data = dataHumana(dataRealizada)
  if (!data) return null
  return `MANUTENÇÃO ${numero} DE ${total} — REALIZADA EM ${data}`
}

export function textoRegistroAnterior() {
  return 'Registro administrativo anterior à implantação. Sem checklist, foto ou ocorrência.'
}

export function rotuloManutencao(tipo: string, numero: number | null, total: number | null) {
  if (tipo === 'avulsa') return 'Manutenção Avulsa'
  if (tipo === 'preventiva' && numero && total && numero > 0 && total > 0) return rotuloVisita(numero, total)
  if (tipo === 'corretiva') return 'Corretiva'
  if (tipo === 'corretiva_complementar') return 'Corretiva complementar'
  return 'Manutenção'
}

export function textoManutencoes(total: number) {
  if (total === 1) return '1 manutenção'
  return `${total} manutenções`
}

export function dataHoraHumana(iso: string | null | undefined) {
  if (!iso) return ''
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(data)
}

export function validarReagendamento(data: string, atual: string) {
  if (!dataValida(data)) return 'Informe a data.'
  if (data === atual.slice(0, 10)) return 'Informe uma data diferente da atual.'
  return null
}

export function validarAvulsa(input: { condominioId: string; data: string; prestadorId: string; matrizes: string[] }) {
  if (!idValido(input.condominioId)) return { erro: 'Selecione o condomínio.', dados: null }
  if (!dataValida(input.data)) return { erro: 'Informe a data.', dados: null }
  if (!idValido(input.prestadorId)) return { erro: 'Selecione o prestador.', dados: null }
  if (input.matrizes.length === 0) return { erro: 'Selecione ao menos um equipamento.', dados: null }
  const vistos = new Set<string>()
  for (const matrizId of input.matrizes) {
    if (!idValido(matrizId) || vistos.has(matrizId)) return { erro: 'Selecione um equipamento da lista.', dados: null }
    vistos.add(matrizId)
  }
  return {
    erro: null,
    dados: {
      condominioId: input.condominioId,
      data: input.data,
      prestadorId: input.prestadorId,
      matrizes: input.matrizes,
    },
  }
}

export function mensagemManutencao(message: string) {
  if (/https?:\/\//i.test(message)) return 'Não foi possível salvar. Confira os dados e tente de novo.'
  const conhecidas = [
    'Somente o ADM pode reagendar',
    'Somente o ADM cria manutenção avulsa',
    'Só é possível reagendar uma visita programada',
    'Visita não encontrada',
    'Informe uma data diferente da atual',
    'Informe a data',
    'Selecione o condomínio',
    'Selecione o prestador',
    'Selecione ao menos um equipamento',
    'Selecione um equipamento da lista',
    'Somente o ADM pode excluir uma manutenção avulsa',
    'Manutenção preventiva do contrato não pode ser excluída',
    'Manutenção já iniciada não pode ser excluída',
    'Manutenção com execução ou ocorrência não pode ser excluída',
    'Somente manutenção avulsa programada pode ser excluída',
    'Confirme a exclusão desta manutenção avulsa',
    'Somente o ADM trata a ocorrência',
    'Informe a observação ou a providência',
    'Informe a solução adotada',
    'Escolha a situação da ocorrência',
    'Já existe um retorno em aberto para esta ocorrência',
    'O histórico da ocorrência não pode ser apagado',
    'Ocorrência não encontrada',
    'Somente o ADM autoriza a liberação do comprovante',
    'O comprovante aguarda autorização',
    'Informe a observação da administração',
    'A observação da administração precisa caber em 400 caracteres',
    'Manutenção concluída normalmente não recebe observação',
    'O comprovante já foi liberado',
    'O comprovante não pode ter URL pública',
    'O comprovante só é liberado pelo fluxo da manutenção',
    'Esta manutenção não aguarda autorização do comprovante',
    'Manutenção cancelada não gera comprovante',
    'Registro anterior não gera comprovante',
    'Esta manutenção não gera comprovante',
    'Ocorrência resolvida no local não depende de orçamento',
  ]
  const encontrada = conhecidas.find((texto) => message.includes(texto))
  if (encontrada) return `${encontrada}.`.replace(/\.\./g, '.')
  if (/registrar_tratamento_ocorrencia|programar_retorno_ocorrencia|registrar_comprovante|situacao_liberacao_comprovante/i.test(message)) {
    return 'O tratamento da ocorrência ainda não está disponível. Aplique a atualização do banco.'
  }
  if (/reagendar_visita|criar_manutencao_avulsa|excluir_manutencao_avulsa|could not find the function/i.test(message)) {
    return 'A agenda ainda não está disponível. Aplique a atualização do banco.'
  }
  if (/row-level security|permission denied/i.test(message)) return 'Sem permissão para esta alteração.'
  return 'Não foi possível salvar. Confira os dados e tente de novo.'
}
