import { dataHumana } from '@/lib/cadastros'
import { dataValida } from '@/lib/contratos'

export const IDENTIFICACAO_ELEVA = 'ELEVA'

export const LIMITE_OBSERVACAO_ADMINISTRACAO = 400

export const CAMPOS_COMPROVANTE = [
  'identificacao',
  'titulo',
  'condominio',
  'dataEfetiva',
  'prestador',
  'equipamentos',
  'observacaoAdministracao',
] as const

export type Comprovante = {
  identificacao: typeof IDENTIFICACAO_ELEVA
  titulo: string
  condominio: string
  dataEfetiva: string
  prestador: string
  equipamentos: string[]
  observacaoAdministracao: string | null
}

export type OcorrenciaParaLiberacao = {
  resolvidaNoLocal: boolean
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
  if (tipo === 'corretiva') return 'MANUTENÇÃO CORRETIVA'
  if (tipo === 'corretiva_complementar') return 'RETORNO TÉCNICO'
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
  return ocorrencias.some((item) => item.resolvidaNoLocal === false)
}

export function normalizarObservacaoAdministracao(valor: string | null | undefined, obrigatoria: boolean) {
  const texto = (valor ?? '').replace(/\s+/g, ' ').trim()
  if (!obrigatoria) {
    if (texto) return { erro: 'Manutenção concluída normalmente não recebe observação.', observacao: null }
    return { erro: null, observacao: null as string | null }
  }
  if (!texto) return { erro: 'Informe a observação da administração.', observacao: null }
  if (texto.length > LIMITE_OBSERVACAO_ADMINISTRACAO) {
    return { erro: 'A observação da administração precisa caber em 400 caracteres.', observacao: null }
  }
  if (/[\u0000-\u001F\u007F]/.test(texto)) return { erro: 'Informe a observação da administração.', observacao: null }
  return { erro: null, observacao: texto }
}

export function prepararComprovante(
  visita: VisitaParaComprovante,
  observacaoAdministracao?: string | null,
): { erro: string; comprovante: null } | { erro: null; comprovante: Comprovante } {
  if (visita.registroAnterior) return { erro: 'Registro anterior não gera comprovante.', comprovante: null }
  if (visita.status === 'cancelada') return { erro: 'Manutenção cancelada não gera comprovante.', comprovante: null }

  const titulo = tituloComprovante(visita.tipo, visita.numeroVisita, visita.quantidadeVisitas)
  if (!titulo) return { erro: 'Esta manutenção não gera comprovante.', comprovante: null }

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

  const textoObservacao = (observacaoAdministracao ?? '').replace(/\s+/g, ' ').trim()
  if (textoObservacao.length > LIMITE_OBSERVACAO_ADMINISTRACAO) {
    return { erro: 'A observação da administração precisa caber em 400 caracteres.', comprovante: null }
  }
  if (textoObservacao && /[\u0000-\u001F\u007F]/.test(textoObservacao)) {
    return { erro: 'Informe a observação da administração.', comprovante: null }
  }

  return {
    erro: null,
    comprovante: {
      identificacao: IDENTIFICACAO_ELEVA,
      titulo,
      condominio,
      dataEfetiva: dataHumana(dataIso),
      prestador,
      equipamentos,
      observacaoAdministracao: textoObservacao || null,
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
    ...(comprovante.observacaoAdministracao ? [comprovante.observacaoAdministracao] : []),
  ].join('\n')
}
