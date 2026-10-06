import { idValido } from '@/lib/cadastros'

export const LIMITE_VISITAS = 240

export const STATUS_CONTRATO = ['ativo', 'encerrado', 'cancelado'] as const

export type StatusContrato = (typeof STATUS_CONTRATO)[number]

export type SituacaoContrato = 'ativos' | 'encerrados' | 'cancelados' | 'todos'

export type EtapaContrato = 'contrato' | 'equipamentos' | 'conferir' | 'programacao'

export type ContratoInput = {
  condominioId: string
  dataInicioContrato: string
  dataInicioManutencao: string
  quantidadeVisitas: string
  prestadorId: string
  status: string
}

export type ContratoDados = {
  condominioId: string
  dataInicioContrato: string
  dataFimContrato: string
  dataInicioManutencao: string
  quantidadeVisitas: number
  prestadorId: string | null
  status: StatusContrato
}

export type EquipamentoContratoInput = {
  matrizId: string
  nome: string
}

export type EquipamentoContratoDados = {
  matrizId: string
  nome: string
}

export type LinhaProgramacao = {
  numero: number
  data: string
  equipamentos: string[]
}

const DATA = /^\d{4}-\d{2}-\d{2}$/

export function dataValida(iso: string) {
  if (!DATA.test(iso)) return false
  const [ano, mes, dia] = iso.split('-').map(Number)
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
}

export function dataVisitaMensal(inicio: string, indice: number) {
  if (!dataValida(inicio) || !Number.isInteger(indice) || indice < 0) {
    throw new Error('Data de visita inválida')
  }
  const [ano, mes, dia] = inicio.split('-').map(Number)
  const primeiro = new Date(Date.UTC(ano, mes - 1 + indice, 1))
  const ultimoDia = new Date(Date.UTC(primeiro.getUTCFullYear(), primeiro.getUTCMonth() + 1, 0)).getUTCDate()
  const diaFinal = Math.min(dia, ultimoDia)
  const data = new Date(Date.UTC(primeiro.getUTCFullYear(), primeiro.getUTCMonth(), diaFinal))
  const y = data.getUTCFullYear()
  const m = String(data.getUTCMonth() + 1).padStart(2, '0')
  const d = String(data.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function sugerirIdentificacao(nomeMatriz: string, quantidadeNoContrato: number) {
  const nome = nomeMatriz.replace(/\s+/g, ' ').trim()
  if (!nome || !Number.isInteger(quantidadeNoContrato) || quantidadeNoContrato < 0) return ''
  return `${nome} ${String(quantidadeNoContrato + 1).padStart(2, '0')}`
}

export function fimContratoCalculado(inicio: string, quantidadeTexto: string) {
  const quantidade = quantidadeTexto.trim()
  if (!dataValida(inicio) || !/^\d+$/.test(quantidade)) return null
  const total = Number(quantidade)
  if (!Number.isInteger(total) || total < 1 || total > LIMITE_VISITAS) return null
  return dataVisitaMensal(inicio, total - 1)
}

export function preverProgramacao(inicio: string, quantidade: number, equipamentos: { nome: string }[]): LinhaProgramacao[] {
  const nomes = equipamentos.map((item) => item.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return Array.from({ length: quantidade }, (_, indice) => ({
    numero: indice + 1,
    data: dataVisitaMensal(inicio, indice),
    equipamentos: nomes,
  }))
}

export function rotuloContrato(numero: string) {
  return `Contrato ${numero}`
}

export function rotuloVisita(numero: number, total: number) {
  return `Visita ${numero}/${total}`
}

export function rotuloStatusContrato(status: string) {
  if (status === 'ativo') return 'Ativo'
  if (status === 'encerrado') return 'Encerrado'
  if (status === 'cancelado') return 'Cancelado'
  return 'Ativo'
}

export function rotuloStatusVisita(status: string) {
  if (status === 'programada') return 'Programada'
  if (status === 'em_execucao') return 'Em execução'
  if (status === 'aguardando_administracao') return 'Aguardando administração'
  if (status === 'realizada') return 'Realizada'
  if (status === 'cancelada') return 'Cancelada'
  return 'Programada'
}

export function textoVisitas(total: number) {
  if (total === 1) return '1 visita'
  return `${total} visitas`
}

export function textoContratos(total: number) {
  if (total === 1) return '1 contrato'
  return `${total} contratos`
}

export function rotuloComposicao(total: number) {
  return `Equipamentos — ${total}`
}

export function situacaoContrato(valor: string | undefined): SituacaoContrato {
  if (valor === 'encerrados' || valor === 'cancelados' || valor === 'todos') return valor
  return 'ativos'
}

export function statusDaSituacao(situacao: SituacaoContrato): StatusContrato | null {
  if (situacao === 'ativos') return 'ativo'
  if (situacao === 'encerrados') return 'encerrado'
  if (situacao === 'cancelados') return 'cancelado'
  return null
}

export function orientacaoContrato(pagina: EtapaContrato, equipamentos: number, gerada: boolean, salvo = true) {
  if (!salvo) {
    return {
      texto: 'Salve o contrato. Em seguida, adicione os equipamentos e gere a programação.',
      destino: null,
      rotulo: null,
    }
  }

  if (gerada) {
    if (pagina === 'conferir' || pagina === 'programacao') {
      return {
        texto: 'A programação deste contrato já foi gerada. As visitas futuras estão listadas abaixo.',
        destino: null,
        rotulo: null,
      }
    }
    return {
      texto: 'A programação deste contrato já foi gerada.',
      destino: 'programacao' as const,
      rotulo: 'Ver programação',
    }
  }

  if (equipamentos === 0) {
    if (pagina === 'equipamentos') {
      return {
        texto: 'Inclua os equipamentos deste contrato.',
        destino: null,
        rotulo: null,
      }
    }
    return {
      texto: 'Próximo passo: adicionar os equipamentos deste contrato.',
      destino: 'equipamentos' as const,
      rotulo: 'Adicionar equipamentos',
    }
  }

  if (pagina === 'conferir') {
    return {
      texto: 'Confira as datas e os equipamentos. Se estiver certo, gere a programação.',
      destino: null,
      rotulo: null,
    }
  }

  return {
    texto: 'Próximo passo: conferir o contrato e gerar a programação.',
    destino: 'conferir' as const,
    rotulo: pagina === 'equipamentos' ? 'Conferir' : 'Conferir e gerar',
  }
}

export function caminhoEtapa(contratoId: string, destino: 'equipamentos' | 'conferir' | 'programacao') {
  if (destino === 'equipamentos') return `/adm/contratos/${contratoId}/equipamentos`
  if (destino === 'programacao') return `/adm/contratos/${contratoId}/conferir#programacao`
  return `/adm/contratos/${contratoId}/conferir`
}

export function validarContrato(input: ContratoInput): { erro: string | null; dados: ContratoDados | null } {
  if (!idValido(input.condominioId)) return { erro: 'Selecione o condomínio.', dados: null }
  if (!dataValida(input.dataInicioContrato)) return { erro: 'Informe a data de início do contrato.', dados: null }
  if (!dataValida(input.dataInicioManutencao)) return { erro: 'Informe a data de início da manutenção.', dados: null }

  const quantidadeTexto = input.quantidadeVisitas.trim()
  if (!/^\d+$/.test(quantidadeTexto) || Number(quantidadeTexto) < 1) {
    return { erro: 'Informe a quantidade de visitas.', dados: null }
  }
  const quantidadeVisitas = Number(quantidadeTexto)
  if (quantidadeVisitas > LIMITE_VISITAS) {
    return { erro: 'A quantidade de visitas está alta demais para gerar de uma vez. Confira o número.', dados: null }
  }
  const dataFimContrato = fimContratoCalculado(input.dataInicioManutencao, quantidadeTexto)
  if (!dataFimContrato) return { erro: 'Informe a quantidade de visitas.', dados: null }

  if (!STATUS_CONTRATO.includes(input.status as StatusContrato)) {
    return { erro: 'Selecione a situação do contrato.', dados: null }
  }

  const prestador = input.prestadorId.trim()
  if (prestador && !idValido(prestador)) return { erro: 'Selecione o prestador.', dados: null }

  return {
    erro: null,
    dados: {
      condominioId: input.condominioId,
      dataInicioContrato: input.dataInicioContrato,
      dataFimContrato,
      dataInicioManutencao: input.dataInicioManutencao,
      quantidadeVisitas,
      prestadorId: prestador || null,
      status: input.status as StatusContrato,
    },
  }
}

export function validarEquipamentoContrato(input: EquipamentoContratoInput): {
  erro: string | null
  dados: EquipamentoContratoDados | null
} {
  if (!idValido(input.matrizId)) return { erro: 'Selecione um equipamento da lista.', dados: null }
  const nome = input.nome.replace(/\s+/g, ' ').trim()
  if (!nome || nome.toLowerCase() === 'sem identificação') return { erro: 'Informe a identificação do equipamento.', dados: null }
  if (nome.length > 80) return { erro: 'Use uma identificação do equipamento mais curta.', dados: null }
  return {
    erro: null,
    dados: { matrizId: input.matrizId, nome },
  }
}

export function mensagemContrato(message: string) {
  const conhecidas = [
    'Somente o ADM cria contrato',
    'Somente o ADM gera a programação',
    'Somente o ADM altera o contrato',
    'Contrato não encontrado',
    'Só é possível gerar a programação de um contrato ativo',
    'A programação deste contrato já foi gerada',
    'Adicione ao menos um equipamento antes de gerar a programação',
    'A quantidade de visitas está alta demais para gerar de uma vez. Confira o número',
    'A programação já foi gerada. O condomínio, a data de início da manutenção e a quantidade de visitas permanecem',
    'Equipamento não encontrado',
    'Informe a identificação do equipamento',
    'Use uma identificação do equipamento mais curta',
    'Selecione um equipamento da lista',
  ]
  const encontrada = conhecidas.find((texto) => message.includes(texto))
  if (encontrada) return `${encontrada}.`.replace(/\.\./g, '.')
  if (/proximo_numero_contrato|gerar_programacao_contrato|salvar_equipamento_contrato|remover_equipamento_contrato|could not find the function/i.test(message)) {
    return 'A área de contratos ainda não está disponível. Aplique a atualização do banco.'
  }
  if (/row-level security|permission denied/i.test(message)) return 'Sem permissão para esta alteração.'
  if (/contratos_fim_calculado|data_fim_contrato/i.test(message)) {
    return 'O fim do contrato é calculado pela programação. Confira o início da manutenção e a quantidade de visitas.'
  }
  if (/quantidade_visitas/i.test(message)) return 'Informe a quantidade de visitas.'
  if (/numero_contrato/i.test(message)) return 'Não foi possível gerar o número do contrato. Tente de novo.'
  return 'Não foi possível salvar. Confira os dados e tente de novo.'
}
