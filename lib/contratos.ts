import { dataHumana, idValido } from '@/lib/cadastros'

export const LIMITE_VISITAS = 240

export const STATUS_CONTRATO = ['ativo', 'encerrado', 'cancelado'] as const

export type StatusContrato = (typeof STATUS_CONTRATO)[number]

export type SituacaoContrato = 'ativos' | 'encerrados' | 'cancelados' | 'todos'

export type EtapaContrato = 'contrato' | 'equipamentos' | 'conferir' | 'programacao'

export type ContratoInput = {
  condominioId: string
  dataInicioContrato: string
  dataFimContrato: string
  dataInicioManutencao: string
  quantidadeVisitas: string
  prestadorId: string
  status: string
}

export type ContratoDados = {
  condominioId: string
  dataInicioContrato: string
  dataFimContrato: string | null
  dataInicioManutencao: string
  quantidadeVisitas: number
  prestadorId: string | null
  status: StatusContrato
}

export type EquipamentoContratoInput = {
  matrizId: string
  nome: string
  entrada: string
  saida: string
}

export type EquipamentoContratoDados = {
  matrizId: string
  nome: string
  entrada: string
  saida: string | null
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

export function equipamentoParticipa(entrada: string, saida: string | null, programada: string) {
  return programada >= entrada && (saida == null || saida === '' || programada <= saida)
}

export function textoAlertaAgenda(inicio: string, quantidadeTexto: string, fim: string) {
  const fimLimpo = fim.trim()
  if (!fimLimpo || !dataValida(inicio) || !dataValida(fimLimpo)) return null
  if (!/^\d+$/.test(quantidadeTexto.trim())) return null
  const quantidade = Number(quantidadeTexto.trim())
  if (quantidade < 1 || quantidade > LIMITE_VISITAS) return null
  if (inicio > fimLimpo) {
    return 'O início da manutenção é posterior ao fim do contrato. A quantidade e as datas não foram alteradas.'
  }
  const ultima = dataVisitaMensal(inicio, quantidade - 1)
  if (ultima > fimLimpo) {
    return `A última visita fica em ${dataHumana(ultima)}, depois do fim do contrato (${dataHumana(fimLimpo)}). A quantidade e as datas não foram alteradas.`
  }
  return null
}

export function preverProgramacao(
  inicio: string,
  quantidade: number,
  equipamentos: { nome: string; entrada: string; saida: string | null }[],
): LinhaProgramacao[] {
  return Array.from({ length: quantidade }, (_, indice) => {
    const data = dataVisitaMensal(inicio, indice)
    const nomes = equipamentos
      .filter((item) => equipamentoParticipa(item.entrada, item.saida, data))
      .map((item) => item.nome)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return { numero: indice + 1, data, equipamentos: nomes }
  })
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

export function periodoEquipamento(entrada: string, saida: string | null) {
  const de = dataHumana(entrada)
  const ate = dataHumana(saida)
  if (ate) return `De ${de} até ${ate}`
  return `A partir de ${de}`
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
        texto: 'Inclua os equipamentos deste contrato. Use a identificação da visita, por exemplo Esteira 01.',
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

  const fim = input.dataFimContrato.trim()
  if (fim && !dataValida(fim)) return { erro: 'Informe uma data de fim válida ou deixe em branco.', dados: null }
  if (fim && fim < input.dataInicioContrato) {
    return { erro: 'A data de fim do contrato precisa ser igual ou posterior ao início.', dados: null }
  }

  const quantidadeTexto = input.quantidadeVisitas.trim()
  if (!/^\d+$/.test(quantidadeTexto) || Number(quantidadeTexto) < 1) {
    return { erro: 'Informe a quantidade de visitas.', dados: null }
  }
  const quantidadeVisitas = Number(quantidadeTexto)
  if (quantidadeVisitas > LIMITE_VISITAS) {
    return { erro: 'A quantidade de visitas está alta demais para gerar de uma vez. Confira o número.', dados: null }
  }

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
      dataFimContrato: fim || null,
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
  if (!nome) return { erro: 'Informe o nome de identificação.', dados: null }
  if (nome.length > 80) return { erro: 'Use uma identificação mais curta.', dados: null }
  if (!dataValida(input.entrada)) return { erro: 'Informe a data de entrada.', dados: null }
  const saida = input.saida.trim()
  if (saida && !dataValida(saida)) return { erro: 'Informe uma data de saída válida ou deixe em branco.', dados: null }
  if (saida && saida < input.entrada) {
    return { erro: 'A data de saída precisa ser igual ou posterior à entrada.', dados: null }
  }
  return {
    erro: null,
    dados: { matrizId: input.matrizId, nome, entrada: input.entrada, saida: saida || null },
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
    'Este equipamento já entrou em visita. Informe a data de saída',
    'Equipamento não encontrado',
    'Informe o nome de identificação',
    'Use uma identificação mais curta',
    'Informe a data de entrada',
    'A data de saída precisa ser igual ou posterior à entrada',
    'Selecione um equipamento da lista',
  ]
  const encontrada = conhecidas.find((texto) => message.includes(texto))
  if (encontrada) return `${encontrada}.`.replace(/\.\./g, '.')
  if (/proximo_numero_contrato|gerar_programacao_contrato|salvar_equipamento_contrato|remover_equipamento_contrato|could not find the function/i.test(message)) {
    return 'A área de contratos ainda não está disponível. Aplique a atualização do banco.'
  }
  if (/row-level security|permission denied/i.test(message)) return 'Sem permissão para esta alteração.'
  if (/data_fim_contrato/i.test(message)) return 'A data de fim do contrato precisa ser igual ou posterior ao início.'
  if (/quantidade_visitas/i.test(message)) return 'Informe a quantidade de visitas.'
  if (/numero_contrato/i.test(message)) return 'Não foi possível gerar o número do contrato. Tente de novo.'
  return 'Não foi possível salvar. Confira os dados e tente de novo.'
}
