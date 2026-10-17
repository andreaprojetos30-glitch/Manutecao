export const ESTADOS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
] as const

export type Situacao = 'ativos' | 'inativos' | 'todos'

export type CondominioInput = {
  nome: string
  cep: string
  endereco: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  estado: string
  quantidadeUnidades: string
  observacoes: string
}

export type CondominioDados = {
  nome: string
  cep: string | null
  endereco: string
  numero: string | null
  complemento: string | null
  bairro: string
  cidade: string
  estado: string
  quantidade_unidades: number | null
  observacoes: string | null
}

export type SindicoInput = {
  nome: string
  whatsapp: string
  email: string
  dataInicio: string
  dataFim: string
}

export type PrestadorInput = {
  nome: string
  whatsapp: string
  email: string
  acesso: string
  observacoes: string
}

export type EquipamentoInput = {
  nome: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function idValido(valor: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)
}

export function termoBusca(valor: string | undefined) {
  return (valor ?? '')
    .replace(/[%_"(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function situacaoFiltro(valor: string | undefined): Situacao {
  if (valor === 'inativos' || valor === 'todos') return valor
  return 'ativos'
}

export const LOTE_MATRIZ = 60

export function situacaoMatriz(valor: string | undefined): Situacao {
  if (valor === 'ativos' || valor === 'inativos') return valor
  return 'todos'
}

export function limiteMatriz(valor: string | undefined) {
  const numero = Number(valor)
  if (!Number.isInteger(numero) || numero < LOTE_MATRIZ) return LOTE_MATRIZ
  return Math.min(numero, LOTE_MATRIZ * 20)
}

export function textoEquipamentos(total: number) {
  if (total === 1) return '1 equipamento'
  return `${total} equipamentos`
}

export function caminhoMatriz(opcoes: { q?: string; situacao?: Situacao; limite?: number; salvo?: string } = {}) {
  const params = new URLSearchParams()
  if (opcoes.q) params.set('q', opcoes.q)
  if (opcoes.situacao && opcoes.situacao !== 'todos') params.set('situacao', opcoes.situacao)
  if (opcoes.limite && opcoes.limite > LOTE_MATRIZ) params.set('limite', String(opcoes.limite))
  if (opcoes.salvo) params.set('salvo', opcoes.salvo)
  const consulta = params.toString()
  return consulta ? `/adm/equipamentos?${consulta}` : '/adm/equipamentos'
}

export function filtroOu(colunas: string[], termo: string) {
  const seguro = termo.replace(/"/g, '')
  return colunas.map((coluna) => `${coluna}.ilike."%${seguro}%"`).join(',')
}

export function combinaBusca(termo: string, campos: Array<string | null | undefined>) {
  if (!termo) return true
  const alvo = termo.toLocaleLowerCase('pt-BR')
  return campos.some((campo) => (campo ?? '').toLocaleLowerCase('pt-BR').includes(alvo))
}

export function dataHumana(iso: string | null | undefined) {
  if (!iso) return ''
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  if (!ano || !mes || !dia) return ''
  return `${dia}/${mes}/${ano}`
}

export function hojeIso(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)
}

export function periodoSindico(inicio: string | null, fim: string | null, ativo: boolean) {
  const de = dataHumana(inicio)
  const ate = dataHumana(fim)
  if (ativo) return de ? `Desde ${de}` : 'Em exercício'
  if (de && ate) return `${de} a ${ate}`
  if (de) return `Desde ${de}`
  if (ate) return `Até ${ate}`
  return 'Período não informado'
}

function limpar(valor: string) {
  const texto = valor.replace(/\s+/g, ' ').trim()
  return texto.length > 0 ? texto : null
}

function emailOuErro(valor: string) {
  const texto = limpar(valor)
  if (!texto) return { email: null as string | null, erro: null as string | null }
  if (!EMAIL.test(texto)) return { email: null, erro: 'E-mail inválido.' }
  return { email: texto, erro: null }
}

export function validarCondominio(input: CondominioInput): { erro: string | null; dados: CondominioDados | null } {
  const nome = limpar(input.nome)
  const endereco = limpar(input.endereco)
  const bairro = limpar(input.bairro)
  const cidade = limpar(input.cidade)
  const estado = input.estado.trim().toUpperCase()
  if (!nome) return { erro: 'Informe o nome do condomínio.', dados: null }
  if (!endereco) return { erro: 'Informe o endereço.', dados: null }
  if (!bairro) return { erro: 'Informe o bairro.', dados: null }
  if (!cidade) return { erro: 'Informe a cidade.', dados: null }
  if (!ESTADOS.includes(estado as (typeof ESTADOS)[number])) return { erro: 'Informe o estado.', dados: null }

  const cepDigitos = input.cep.replace(/\D/g, '')
  let cep: string | null = null
  if (cepDigitos) {
    if (cepDigitos.length !== 8) {
      return { erro: 'CEP inválido. Corrija ou apague o CEP. O endereço pode ser preenchido manualmente.', dados: null }
    }
    cep = `${cepDigitos.slice(0, 5)}-${cepDigitos.slice(5)}`
  }

  let quantidade: number | null = null
  const quantidadeTexto = input.quantidadeUnidades.trim()
  if (quantidadeTexto) {
    if (!/^\d+$/.test(quantidadeTexto)) return { erro: 'A quantidade de unidades precisa ser um número.', dados: null }
    quantidade = Number(quantidadeTexto)
  }

  return {
    erro: null,
    dados: {
      nome,
      cep,
      endereco,
      numero: limpar(input.numero),
      complemento: limpar(input.complemento),
      bairro,
      cidade,
      estado,
      quantidade_unidades: quantidade,
      observacoes: limpar(input.observacoes),
    },
  }
}

export function validarSindicoNovo(input: SindicoInput): {
  erro: string | null
  dados: { nome: string; whatsapp: string | null; email: string | null; data_inicio: string } | null
} {
  const nome = limpar(input.nome)
  if (!nome) return { erro: 'Informe o nome do síndico.', dados: null }
  if (!input.dataInicio) return { erro: 'Informe a data de início.', dados: null }
  const email = emailOuErro(input.email)
  if (email.erro) return { erro: email.erro, dados: null }
  return {
    erro: null,
    dados: {
      nome,
      whatsapp: limpar(input.whatsapp),
      email: email.email,
      data_inicio: input.dataInicio,
    },
  }
}

export function validarSindicoCorrecao(input: SindicoInput, ativo: boolean): {
  erro: string | null
  dados: {
    nome: string
    whatsapp: string | null
    email: string | null
    data_inicio?: string
    data_fim?: null
  } | null
} {
  const nome = limpar(input.nome)
  if (!nome) return { erro: 'Informe o nome do síndico.', dados: null }
  const email = emailOuErro(input.email)
  if (email.erro) return { erro: email.erro, dados: null }
  if (!ativo) {
    return {
      erro: null,
      dados: {
        nome,
        whatsapp: limpar(input.whatsapp),
        email: email.email,
      },
    }
  }
  if (!input.dataInicio) return { erro: 'Informe a data de início.', dados: null }
  return {
    erro: null,
    dados: {
      nome,
      whatsapp: limpar(input.whatsapp),
      email: email.email,
      data_inicio: input.dataInicio,
      data_fim: null,
    },
  }
}

export function validarPrestador(input: PrestadorInput): {
  erro: string | null
  dados: { nome: string; whatsapp: string; email: string | null; acesso: 'sim' | 'nao'; observacoes: string | null } | null
} {
  const nome = limpar(input.nome)
  const whatsapp = limpar(input.whatsapp)
  if (!nome) return { erro: 'Informe o nome do prestador.', dados: null }
  if (!whatsapp) return { erro: 'Informe o WhatsApp.', dados: null }
  const email = emailOuErro(input.email.toLowerCase())
  if (email.erro) return { erro: email.erro, dados: null }
  const acesso = input.acesso === 'sim' ? 'sim' : 'nao'
  if (acesso === 'sim' && !email.email) return { erro: 'Informe o e-mail para liberar o acesso ao aplicativo.', dados: null }
  return {
    erro: null,
    dados: {
      nome,
      whatsapp,
      email: email.email,
      acesso,
      observacoes: limpar(input.observacoes),
    },
  }
}

export function validarEquipamento(input: EquipamentoInput): {
  erro: string | null
  dados: { nome: string } | null
} {
  const nome = limpar(input.nome)
  if (!nome) return { erro: 'Informe o nome do equipamento.', dados: null }
  return { erro: null, dados: { nome } }
}

export function mensagemBanco(message: string) {
  const conhecidas = [
    'Já existe um síndico ativo neste condomínio',
    'Somente o ADM cadastra síndico',
    'Informe o nome do síndico',
    'Informe a data de início',
    'A data de início precisa ser igual ou posterior à do síndico atual',
    'Condomínio não encontrado',
    'Um período encerrado não volta a ficar ativo. Registre um novo síndico',
    'A data de fim de um período encerrado não pode ser alterada',
    'A data de início de um período encerrado não pode ser alterada',
    'Este período já está no histórico. Registre um novo síndico',
  ]
  const encontrada = conhecidas.find((texto) => message.includes(texto))
  if (encontrada) return `${encontrada}.`.replace('..', '.')
  if (/registrar_sindico|could not find the function/i.test(message)) {
    return 'A troca de síndico ainda não está disponível. Aplique a atualização do banco.'
  }
  if (/row-level security|permission denied/i.test(message)) return 'Sem permissão para esta alteração.'
  if (/whatsapp/i.test(message)) return 'Informe o WhatsApp.'
  if (/usuario_id/i.test(message)) return 'Esse acesso já está vinculado a outro prestador.'
  if (/sindicos_um_ativo/i.test(message)) return 'Já existe um síndico ativo neste condomínio.'
  return 'Não foi possível salvar. Confira os dados e tente de novo.'
}

export function textoSalvo(codigo: string | undefined) {
  if (codigo === 'contrato') return 'Contrato salvo.'
  if (codigo === 'equipamento') return 'Equipamento salvo.'
  if (codigo === 'equipamentos') return 'Equipamentos adicionados.'
  if (codigo === 'identificacao') return 'Identificação salva.'
  if (codigo === 'programacao') return 'Programação gerada.'
  if (codigo === 'anteriores') return 'Visitas anteriores registradas. A numeração e as datas mensais permanecem.'
  if (codigo === 'removido') return 'Equipamento removido.'
  if (codigo === 'situacao') return 'Situação atualizada.'
  if (codigo === 'sindico') return 'Síndico registrado. O anterior permanece no histórico.'
  if (codigo === 'avulsa') return 'Manutenção avulsa criada.'
  if (codigo === 'reagendada') return 'Data da visita alterada.'
  if (codigo === 'excluida') return 'Manutenção avulsa excluída.'
  if (codigo === 'equipamento-ok') return 'Equipamento registrado como OK.'
  if (codigo === 'ocorrencia') return 'Ocorrência registrada.'
  if (codigo === 'finalizada') return 'Manutenção finalizada.'
  if (codigo === 'salvo') return 'Cadastro salvo.'
  if (codigo === 'ativacao') return 'Nova ativação gerada. Envie o link ao prestador.'
  if (codigo === 'tratamento') return 'Tratamento da ocorrência registrado.'
  if (codigo === 'retorno') return 'Retorno técnico programado.'
  return null
}
