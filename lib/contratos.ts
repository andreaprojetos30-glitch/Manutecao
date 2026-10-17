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

export const LIMITE_QUANTIDADE_UNIDADE = 99

export type SelecaoEquipamento = {
  matrizId: string
  quantidade: number
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

export function rotuloUnidade(nomeMatriz: string, identificacao: string | null | undefined) {
  const nome = nomeMatriz.replace(/\s+/g, ' ').trim()
  const ident = (identificacao ?? '').replace(/\s+/g, ' ').trim()
  if (!ident || ident.toLowerCase() === 'sem identificação') return nome
  if (!nome) return ident
  return `${nome} — ${ident}`
}

export function textoSelecionados(unidades: number) {
  if (unidades <= 0) return 'Nenhum equipamento selecionado'
  if (unidades === 1) return '1 unidade selecionada'
  return `${unidades} unidades selecionadas`
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

export function validarIdentificacao(valor: string): { erro: string | null; identificacao: string | null } {
  const texto = valor.replace(/\s+/g, ' ').trim()
  if (!texto || texto.toLowerCase() === 'sem identificação') return { erro: null, identificacao: null }
  if (texto.length > 80) return { erro: 'Use uma identificação do equipamento mais curta.', identificacao: null }
  return { erro: null, identificacao: texto }
}

export function validarSelecaoEquipamentos(itens: { matrizId: string; quantidade: string }[]): {
  erro: string | null
  dados: SelecaoEquipamento[] | null
} {
  if (itens.length === 0) return { erro: 'Selecione ao menos um equipamento.', dados: null }
  const vistos = new Set<string>()
  const dados: SelecaoEquipamento[] = []
  for (const item of itens) {
    if (!idValido(item.matrizId) || vistos.has(item.matrizId)) {
      return { erro: 'Selecione um equipamento da lista.', dados: null }
    }
    vistos.add(item.matrizId)
    const quantidade = item.quantidade.trim()
    if (!/^\d+$/.test(quantidade) || Number(quantidade) < 1) return { erro: 'Informe a quantidade.', dados: null }
    if (Number(quantidade) > LIMITE_QUANTIDADE_UNIDADE) {
      return { erro: 'A quantidade está alta demais. Confira o número.', dados: null }
    }
    dados.push({ matrizId: item.matrizId, quantidade: Number(quantidade) })
  }
  return { erro: null, dados }
}

export function limiteVisitasAnteriores(
  visitas: { numero_visita: number; status: string; registro_anterior: boolean; tem_execucao: boolean }[],
) {
  const ordenadas = [...visitas].sort((a, b) => a.numero_visita - b.numero_visita)
  let limite = 0
  for (const visita of ordenadas) {
    if (visita.numero_visita !== limite + 1) break
    if (visita.status !== 'programada' || visita.registro_anterior || visita.tem_execucao) break
    limite += 1
  }
  return limite
}

export function validarVisitasAnteriores(
  total: number,
  maximo: number,
  anterioresTexto: string,
  datas: string[],
  confirmar: boolean,
) {
  const texto = anterioresTexto.trim()
  if (texto === '' || texto === '0') return { erro: null, anteriores: 0, datas: [] as string[] }
  if (!/^\d+$/.test(texto)) return { erro: 'Informe a quantidade de visitas anteriores.', anteriores: 0, datas: [] as string[] }
  const anteriores = Number(texto)
  if (!Number.isInteger(anteriores) || anteriores < 0) {
    return { erro: 'Informe a quantidade de visitas anteriores.', anteriores: 0, datas: [] as string[] }
  }
  if (anteriores > total) {
    return { erro: 'A quantidade de visitas anteriores passa do total do contrato.', anteriores: 0, datas: [] as string[] }
  }
  if (anteriores > maximo) return { erro: 'Não é possível alterar visita já iniciada.', anteriores: 0, datas: [] as string[] }
  if (datas.length !== anteriores || datas.some((data) => !dataValida(data.slice(0, 10)))) {
    return { erro: 'Informe a data efetiva de cada visita anterior.', anteriores: 0, datas: [] as string[] }
  }
  if (!confirmar) return { erro: 'Confirme as visitas anteriores.', anteriores: 0, datas: [] as string[] }
  return { erro: null, anteriores, datas: datas.map((data) => data.slice(0, 10)) }
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
    'Confirme as visitas anteriores',
    'Informe a quantidade de visitas anteriores',
    'Informe a data efetiva de cada visita anterior',
    'A quantidade de visitas anteriores passa do total do contrato',
    'Não é possível alterar visita já iniciada',
    'A numeração e as datas programadas permanecem',
    'Visita anterior exige confirmação do ADM',
    'Somente o ADM registra visita anterior',
    'A programação deste contrato ainda não foi gerada',
    'A quantidade de visitas está alta demais para gerar de uma vez. Confira o número',
    'A programação já foi gerada. O condomínio, a data de início da manutenção e a quantidade de visitas permanecem',
    'Equipamento não encontrado',
    'Informe a identificação do equipamento',
    'Use uma identificação do equipamento mais curta',
    'Selecione um equipamento da lista',
    'Selecione ao menos um equipamento',
    'Informe a quantidade',
    'A quantidade está alta demais. Confira o número',
  ]
  const encontrada = conhecidas.find((texto) => message.includes(texto))
  if (encontrada) return `${encontrada}.`.replace(/\.\./g, '.')
  if (/proximo_numero_contrato|gerar_programacao_contrato|registrar_visitas_anteriores|salvar_equipamento_contrato|remover_equipamento_contrato|adicionar_equipamentos_contrato|definir_identificacao_equipamento|could not find the function/i.test(message)) {
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
