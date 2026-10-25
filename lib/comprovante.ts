import { dataHumana } from '@/lib/cadastros'
import { dataValida } from '@/lib/contratos'

export const IDENTIFICACAO_ELEVA = 'ELEVA'

export const CAMPOS_COMPROVANTE = [
  'identificacao',
  'titulo',
  'condominio',
  'dataEfetiva',
  'prestador',
  'equipamentos',
] as const

export type Comprovante = {
  identificacao: typeof IDENTIFICACAO_ELEVA
  titulo: string
  condominio: string
  dataEfetiva: string
  prestador: string
  equipamentos: string[]
}

export type OcorrenciaParaLiberacao = {
  necessitaOrcamento: boolean
  situacao: string
}

export type VisitaParaComprovante = {
  tipo: string
  numeroVisita: number | null
  quantidadeVisitas: number | null
  registroAnterior: boolean
  status: string
  condominio: string
  dataEfetiva: string | null
  prestador: string | null
  equipamentos: Array<{ nome: string }>
}

function inteiro(valor: number | null): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor)
}

function textoLimpo(valor: string | null | undefined) {
  return (valor ?? '').replace(/\s+/g, ' ').trim()
}

export function tituloComprovante(tipo: string, numero: number | null, total: number | null) {
  if (tipo === 'avulsa') return 'MANUTENÇÃO AVULSA'
  if (
    tipo === 'preventiva'
    && inteiro(numero)
    && inteiro(total)
    && numero >= 1
    && total >= 1
    && numero <= total
  ) {
    return `VISITA ${numero}/${total}`
  }
  return null
}

export function comprovanteExigeAutorizacao(ocorrencias: OcorrenciaParaLiberacao[]) {
  return ocorrencias.some((item) => item.necessitaOrcamento === true || item.situacao === 'aguardando_orcamento')
}

export function prepararComprovante(visita: VisitaParaComprovante): { erro: string; comprovante: null } | { erro: null; comprovante: Comprovante } {
  if (visita.registroAnterior) return { erro: 'Registro anterior não gera comprovante.', comprovante: null }
  if (visita.status === 'cancelada') return { erro: 'Manutenção cancelada não gera comprovante.', comprovante: null }

  const titulo = tituloComprovante(visita.tipo, visita.numeroVisita, visita.quantidadeVisitas)
  if (!titulo) return { erro: 'Somente a visita contratual ou a manutenção avulsa gera comprovante.', comprovante: null }

  const condominio = textoLimpo(visita.condominio)
  if (!condominio) return { erro: 'Informe o condomínio.', comprovante: null }

  const dataIso = (visita.dataEfetiva ?? '').slice(0, 10)
  if (!dataValida(dataIso)) return { erro: 'Informe a data efetiva.', comprovante: null }

  const prestador = textoLimpo(visita.prestador)
  if (!prestador) return { erro: 'Informe o prestador.', comprovante: null }

  const equipamentos = visita.equipamentos
    .map((item) => textoLimpo(item.nome))
    .filter((nome) => nome.length > 0)
  if (equipamentos.length === 0) return { erro: 'Informe os equipamentos atendidos.', comprovante: null }

  return {
    erro: null,
    comprovante: {
      identificacao: IDENTIFICACAO_ELEVA,
      titulo,
      condominio,
      dataEfetiva: dataHumana(dataIso),
      prestador,
      equipamentos,
    },
  }
}

export function textoComprovante(comprovante: Comprovante) {
  return [
    comprovante.identificacao,
    comprovante.titulo,
    comprovante.condominio,
    comprovante.dataEfetiva,
    comprovante.prestador,
    ...comprovante.equipamentos,
  ].join('\n')
}
