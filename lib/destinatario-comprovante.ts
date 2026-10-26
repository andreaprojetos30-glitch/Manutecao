import { dataValida } from '@/lib/contratos'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PAPEIS = ['gerente', 'conselheiro', 'administradora', 'outro'] as const

export type PapelIndicacao = (typeof PAPEIS)[number]

export type DestinatarioInput = {
  papel: string
  nome: string
  whatsapp: string
  email: string
  complemento: string
  dataInicio: string
}

export type DestinatarioDados = {
  papel: PapelIndicacao
  nome: string
  whatsapp: string
  email: string | null
  complemento: string | null
  data_inicio: string
}

function limpar(valor: string) {
  const texto = valor.replace(/\s+/g, ' ').trim()
  return texto.length > 0 ? texto : null
}

export function rotuloPapelDestinatario(papel: string | null | undefined, complemento?: string | null) {
  if (papel === 'sindico') return 'síndico'
  if (papel === 'gerente') return 'gerente'
  if (papel === 'conselheiro') return 'conselheiro'
  if (papel === 'administradora') return 'representante da administradora'
  if (papel === 'outro') return limpar(complemento ?? '') ?? 'outro responsável'
  return 'responsável'
}

export function validarDestinatario(input: DestinatarioInput): { erro: string | null; dados: DestinatarioDados | null } {
  if (!PAPEIS.includes(input.papel as PapelIndicacao)) {
    return { erro: 'Informe o papel de quem recebe os comprovantes.', dados: null }
  }
  const papel = input.papel as PapelIndicacao
  const nome = limpar(input.nome)
  if (!nome) return { erro: 'Informe o nome de quem recebe os comprovantes.', dados: null }
  const whatsapp = limpar(input.whatsapp)
  if (!whatsapp) return { erro: 'Informe o WhatsApp de quem recebe os comprovantes.', dados: null }
  const complemento = limpar(input.complemento)
  if (papel === 'outro' && !complemento) return { erro: 'Informe qual é o responsável.', dados: null }
  const email = limpar(input.email)
  if (email && !EMAIL.test(email)) return { erro: 'E-mail inválido.', dados: null }
  if (!dataValida(input.dataInicio)) return { erro: 'Informe a data de início.', dados: null }
  return {
    erro: null,
    dados: {
      papel,
      nome,
      whatsapp,
      email,
      complemento: papel === 'outro' ? complemento : null,
      data_inicio: input.dataInicio,
    },
  }
}
