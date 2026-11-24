import { dataHumana, idValido } from '@/lib/cadastros'

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
  visitasAnteriores: string
  prestadorId: string
  status: string
}

export type ContratoDados = {
  condominioId: string
  dataInicioContrato: string
  dataFimContrato: string
  dataInicioManutencao: string
  quantidadeVisitas: number
  visitasAnteriores: number
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

export function preverProgramacao(
  inicio: string,
  quantidade: number,
  equipamentos: { nome: string }[],
  anteriores = 0,
): LinhaProgramacao[] {
  const nomes = equipamentos.map((item) => item.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const inicioIndice = Number.isInteger(anteriores) && anteriores > 0 ? anteriores : 0
  const faltam = Math.max(quantidade - inicioIndice, 0)
  return Array.from({ length: faltam }, (_, indice) => ({
    numero: inicioIndice + indice + 1,
    data: dataVisitaMensal(inicio, inicioIndice + indice),
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

  const anterioresTexto = input.visitasAnteriores.trim()
  if (!/^\d+$/.test(anterioresTexto)) return { erro: 'Informe a quantidade de visitas anteriores.', dados: null }
  const visitasAnteriores = Number(anterioresTexto)
  if (visitasAnteriores > quantidadeVisitas) {
    return { erro: 'A quantidade de visitas anteriores passa do total do contrato.', dados: null }
  }
  if (visitasAnteriores >= quantidadeVisitas) {
    return { erro: 'A próxima visita precisa permanecer na programação.', dados: null }
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
      dataFimContrato,
      dataInicioManutencao: input.dataInicioManutencao,
      quantidadeVisitas,
      visitasAnteriores,
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

type VisitaAnteriorElegivel = {
  numero_visita: number
  status: string
  registro_anterior: boolean
  tem_execucao: boolean
}

export function limiteVisitasAnteriores(visitas: VisitaAnteriorElegivel[], inicio = 1) {
  const ordenadas = [...visitas].sort((a, b) => a.numero_visita - b.numero_visita)
  const partida = Number.isInteger(inicio) && inicio > 0 ? inicio : 1
  let limite = 0
  let esperado = partida
  for (const visita of ordenadas) {
    if (visita.numero_visita < esperado) continue
    if (visita.numero_visita !== esperado) break
    if (visita.status !== 'programada' || visita.registro_anterior || visita.tem_execucao) break
    limite += 1
    esperado += 1
  }
  return limite
}

const regraVisitasAnteriores =
  'Só é possível retirar uma sequência contínua de visitas ainda intactas, a partir da primeira. Visitas executadas permanecem.'

export function textoProximaVisita(anteriores: number, total: number, jaGerada = false, jaContadas = 0) {
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(anteriores) || anteriores < 0) {
    return 'Informe a quantidade de visitas anteriores.'
  }
  const base = jaGerada && Number.isInteger(jaContadas) && jaContadas > 0 ? jaContadas : 0
  const destino = base + anteriores
  if (destino >= total) return 'A próxima visita precisa permanecer na programação.'
  if (anteriores === 0) {
    return jaGerada
      ? 'Informe quantas visitas iniciais ainda intactas saem da agenda.'
      : `A programação começa na ${rotuloVisita(1, total)}.`
  }
  return `A próxima manutenção será a ${rotuloVisita(destino + 1, total)}. As visitas anteriores não entram na agenda.`
}

export function textoPlanejamento(totalTexto: string, anterioresTexto: string) {
  const total = totalTexto.trim()
  const anteriores = anterioresTexto.trim()
  if (!/^\d+$/.test(total) || !/^\d+$/.test(anteriores)) return null
  const contratadas = Number(total)
  const feitas = Number(anteriores)
  if (!Number.isInteger(contratadas) || contratadas < 1 || contratadas > LIMITE_VISITAS) return null
  if (feitas > contratadas) return 'A quantidade de visitas anteriores passa do total do contrato.'
  if (feitas >= contratadas) return 'A próxima visita precisa permanecer na programação.'
  const aProgramar = contratadas - feitas
  return `Visitas a programar: ${aProgramar}. Próxima visita: ${rotuloVisita(feitas + 1, contratadas)}. Última visita: ${rotuloVisita(contratadas, contratadas)}.`
}

export function confirmacaoAnteriores(anteriores: number) {
  if (anteriores === 1) return 'Confirmo que 1 visita já ocorreu antes do sistema e não terá ficha nem comprovante.'
  return `Confirmo que ${anteriores} visitas já ocorreram antes do sistema e não terão ficha nem comprovante.`
}

export function notaRetirada(jaContadas: number) {
  if (jaContadas <= 0) {
    return 'Retira somente visitas ainda intactas, a partir da primeira. A próxima conserva o número e a data mensal.'
  }
  const contadas = jaContadas === 1 ? '1 visita anterior já está contabilizada' : `${jaContadas} visitas anteriores já estão contabilizadas`
  return `${contadas}. Informe só quantas visitas intactas saem agora. Elas somam a esse total, sem contar de novo as que já saíram. A próxima conserva o número e a data mensal.`
}

export function textoGeracao(anteriores: number) {
  if (anteriores <= 0) {
    return 'Nenhuma visita anterior está salva. A programação começa na visita 1. Para informar visitas já feitas, corrija o contrato antes de gerar.'
  }
  if (anteriores === 1) {
    return 'Está salva 1 visita anterior. Ela não gera manutenção. Para mudar essa quantidade, corrija o contrato antes de gerar.'
  }
  return `Estão salvas ${anteriores} visitas anteriores. Elas não geram manutenção. Para mudar essa quantidade, corrija o contrato antes de gerar.`
}

export function motivoSemVisitasAnteriores(visitas: VisitaAnteriorElegivel[], total = 0, inicio = 1) {
  const ordenadas = [...visitas].sort((a, b) => a.numero_visita - b.numero_visita)
  const partida = Number.isInteger(inicio) && inicio > 0 ? inicio : 1
  const atual = ordenadas.find((visita) => visita.numero_visita >= partida) ?? ordenadas[0]
  if (atual && atual.numero_visita > partida) {
    const rotulo = total >= atual.numero_visita ? rotuloVisita(atual.numero_visita, total) : `Visita ${atual.numero_visita}`
    return `A programação começa na ${rotulo}. As visitas anteriores não têm ficha nem comprovante.`
  }
  const primeira = atual?.numero_visita === partida ? atual : undefined
  const nome = !primeira
    ? partida === 1
      ? 'visita 1'
      : total >= partida
        ? rotuloVisita(partida, total)
        : `visita ${partida}`
    : total >= primeira.numero_visita
      ? rotuloVisita(primeira.numero_visita, total)
      : `visita ${primeira.numero_visita}`
  if (!primeira) {
    return `Não há visitas elegíveis. A ${nome} não está na programação. ${regraVisitasAnteriores}`
  }
  if (primeira.registro_anterior) {
    return `Não há visitas elegíveis. A ${nome} já foi registrada como anterior. ${regraVisitasAnteriores}`
  }
  if (primeira.status === 'cancelada') {
    return `Não há visitas elegíveis. A ${nome} está cancelada. ${regraVisitasAnteriores}`
  }
  if (primeira.status === 'realizada') {
    return `Não há visitas elegíveis. A ${nome} já foi realizada. ${regraVisitasAnteriores}`
  }
  if (primeira.status === 'aguardando_administracao') {
    return `Não há visitas elegíveis. A ${nome} está aguardando administração. ${regraVisitasAnteriores}`
  }
  if (primeira.tem_execucao || primeira.status !== 'programada') {
    return `Não há visitas elegíveis. A ${nome} já foi iniciada. ${regraVisitasAnteriores}`
  }
  return `Não há visitas elegíveis. ${regraVisitasAnteriores}`
}

export function validarVisitasAnteriores(
  total: number,
  maximo: number,
  anterioresTexto: string,
  confirmar: boolean,
  jaContadas = 0,
) {
  const texto = anterioresTexto.trim()
  const base = Number.isInteger(jaContadas) && jaContadas > 0 ? jaContadas : 0
  if (texto === '' || texto === '0') return { erro: null, anteriores: 0 }
  if (!/^\d+$/.test(texto)) return { erro: 'Informe a quantidade de visitas anteriores.', anteriores: 0 }
  const anteriores = Number(texto)
  if (!Number.isInteger(anteriores) || anteriores < 0) {
    return { erro: 'Informe a quantidade de visitas anteriores.', anteriores: 0 }
  }
  const destino = base + anteriores
  if (destino > total || anteriores > total) {
    return { erro: 'A quantidade de visitas anteriores passa do total do contrato.', anteriores: 0 }
  }
  if (destino >= total) return { erro: 'A próxima visita precisa permanecer na programação.', anteriores: 0 }
  if (anteriores > maximo) return { erro: 'Não é possível alterar visita já iniciada.', anteriores: 0 }
  if (!confirmar) return { erro: 'Confirme as visitas anteriores.', anteriores: 0 }
  return { erro: null, anteriores }
}

export type VisitaResumo = {
  numero_visita: number
  status: string
  registro_anterior?: boolean
  data_programada_atual?: string | null
  tipo?: string
}

export type ResumoContrato = {
  contratadas: number
  anteriores: number
  realizadasSistema: number
  restantes: number
  canceladas: number
  proximaNumero: number | null
  proximaData: string | null
  proxima: string
}

const STATUS_REALIZADA_SISTEMA = new Set(['realizada', 'aguardando_administracao'])
const STATUS_RESTANTE = new Set(['programada', 'em_execucao'])

function preventivasDoSaldo(visitas: VisitaResumo[]) {
  return visitas.filter((visita) => (visita.tipo ?? 'preventiva') === 'preventiva' && visita.registro_anterior !== true)
}

export function textoProximaResumo(numero: number | null, total: number, data: string | null) {
  if (numero == null) return 'Não há próxima visita.'
  const rotulo = rotuloVisita(numero, total)
  if (!data) return rotulo
  const humana = dataHumana(data)
  return humana ? `${rotulo} · ${humana}` : rotulo
}

export function textoCanceladasForaDoSaldo(canceladas: number) {
  if (!Number.isInteger(canceladas) || canceladas <= 0) return null
  if (canceladas === 1) return '1 visita cancelada não entra nas realizadas nem nas restantes.'
  return `${canceladas} visitas canceladas não entram nas realizadas nem nas restantes.`
}

export function resumoContrato(entrada: {
  total: number
  anteriores: number
  inicioManutencao: string
  gerada: boolean
  visitas: VisitaResumo[]
}): ResumoContrato {
  const preventivas = preventivasDoSaldo(entrada.visitas)
  const realizadasSistema = preventivas.filter((visita) => STATUS_REALIZADA_SISTEMA.has(visita.status)).length
  const abertas = preventivas
    .filter((visita) => STATUS_RESTANTE.has(visita.status))
    .sort((a, b) => a.numero_visita - b.numero_visita)
  const canceladas = preventivas.filter((visita) => visita.status === 'cancelada').length
  const restantes = entrada.gerada ? abertas.length : Math.max(entrada.total - entrada.anteriores, 0)
  const proximaNumero = entrada.gerada
    ? (abertas[0]?.numero_visita ?? null)
    : restantes > 0
      ? entrada.anteriores + 1
      : null
  const dataAberta = abertas[0]?.data_programada_atual?.slice(0, 10) ?? null
  const proximaData = entrada.gerada
    ? dataAberta
    : proximaNumero
      ? dataVisitaMensal(entrada.inicioManutencao, proximaNumero - 1)
      : null
  return {
    contratadas: entrada.total,
    anteriores: entrada.anteriores,
    realizadasSistema,
    restantes,
    canceladas,
    proximaNumero,
    proximaData,
    proxima: textoProximaResumo(proximaNumero, entrada.total, proximaData),
  }
}

export function saldoPreventivoConsistente(total: number, anteriores: number, visitas: VisitaResumo[]) {
  return anteriores + preventivasDoSaldo(visitas).length === total
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
    'A próxima visita precisa permanecer na programação',
    'Não é possível alterar visita já iniciada',
    'A numeração e as datas programadas permanecem',
    'Visita anterior exige confirmação do ADM',
    'Somente o ADM registra visita anterior',
    'A programação deste contrato ainda não foi gerada',
    'A quantidade de visitas está alta demais para gerar de uma vez. Confira o número',
    'A programação já foi gerada. O condomínio, a data de início da manutenção e a quantidade de visitas permanecem',
    'A programação já foi gerada. As visitas anteriores permanecem',
    'As visitas anteriores deste contrato já foram informadas',
    'O saldo de visitas do contrato ficou inconsistente',
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
  if (/contratos_visitas_anteriores/i.test(message)) {
    return 'A quantidade de visitas anteriores passa do total do contrato.'
  }
  if (/quantidade_visitas/i.test(message)) return 'Informe a quantidade de visitas.'
  if (/numero_contrato/i.test(message)) return 'Não foi possível gerar o número do contrato. Tente de novo.'
  return 'Não foi possível salvar. Confira os dados e tente de novo.'
}
