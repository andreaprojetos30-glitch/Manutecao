export const TAMANHO_MAXIMO_FOTO = 8 * 1024 * 1024

const EXTENSOES = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']

export type ArquivoFoto = { size: number; type: string; name: string }

export function visitaEditavel(status: string) {
  return status === 'programada' || status === 'em_execucao'
}

export function textoProgresso(verificados: number, total: number) {
  if (total <= 0) return 'Nenhum equipamento nesta visita.'
  if (total === 1) {
    return verificados >= 1 ? '1 de 1 equipamento verificado' : '0 de 1 equipamento verificado'
  }
  return `${verificados} de ${total} equipamentos verificados`
}

export function textoFaltam(pendentes: number) {
  if (pendentes <= 0) return null
  if (pendentes === 1) return 'Ainda falta 1 equipamento para finalizar.'
  return `Ainda faltam ${pendentes} equipamentos para finalizar.`
}

export function rotuloResultado(resultado: string, resolvida: boolean | null) {
  if (resultado === 'ok') return 'OK'
  if (resultado === 'ocorrencia' && resolvida === true) return 'Ocorrência · Resolvida no local'
  if (resultado === 'ocorrencia' && resolvida === false) return 'Ocorrência · Não resolvida no local'
  if (resultado === 'ocorrencia') return 'Ocorrência'
  return 'Pendente'
}

export function acaoVisita(status: string) {
  if (status === 'programada') return 'Iniciar manutenção'
  if (status === 'em_execucao') return 'Continuar manutenção'
  return 'Consultar'
}

export function validarOcorrencia(descricao: string, resolvida: string) {
  const texto = descricao.replace(/\s+/g, ' ').trim()
  if (!texto) return { erro: 'Descreva o problema.', descricao: '', resolvida: null as boolean | null }
  if (resolvida !== 'sim' && resolvida !== 'nao') {
    return { erro: 'Informe se foi resolvida no local.', descricao: texto, resolvida: null }
  }
  return { erro: null, descricao: texto, resolvida: resolvida === 'sim' }
}

export function validarFoto(arquivo: ArquivoFoto | null, temAtual: boolean) {
  if (!arquivo || arquivo.size <= 0) return temAtual ? null : 'Selecione uma foto.'
  if (arquivo.size > TAMANHO_MAXIMO_FOTO) return 'A foto passou do tamanho permitido.'
  const tipo = arquivo.type.toLowerCase()
  const nome = arquivo.name.toLowerCase()
  const extensao = nome.includes('.') ? (nome.split('.').pop() ?? '') : ''
  const tipoOk = tipo.startsWith('image/') && tipo !== 'image/svg+xml'
  const extensaoOk = EXTENSOES.includes(extensao)
  if (!tipoOk && !extensaoOk) return 'A foto precisa ser uma imagem.'
  return null
}

export function extensaoFoto(nome: string) {
  const extensao = nome.toLowerCase().split('.').pop() ?? ''
  if (EXTENSOES.includes(extensao)) return extensao === 'jpeg' ? 'jpg' : extensao
  return 'jpg'
}

export function mensagemExecucao(message: string) {
  const conhecidas = [
    'Ocorrência exige resolução, descrição e foto',
    'Visita encerrada para edição do prestador',
    'Visita não pode ser finalizada neste status',
    'Visita sem equipamentos não pode ser finalizada',
    'Todos os equipamentos precisam ser tratados',
    'Visita não atribuída',
    'Visita não encontrada',
    'Equipamento não encontrado',
    'Sem acesso operacional',
    'Confirme a finalização desta manutenção',
    'Descreva o problema',
    'Informe se foi resolvida no local',
    'Selecione uma foto',
    'A foto passou do tamanho permitido',
    'A foto precisa ser uma imagem',
    'A foto não foi enviada',
  ]
  const encontrada = conhecidas.find((texto) => message.includes(texto))
  if (encontrada) return `${encontrada}.`.replace(/\.\./g, '.')
  if (/registrar_ok|registrar_ocorrencia|finalizar_manutencao|could not find the function/i.test(message)) {
    return 'A execução ainda não está disponível. Aplique a atualização do banco.'
  }
  if (/row-level security|permission denied|payload too large|body exceeded/i.test(message)) {
    return 'Não foi possível salvar. Verifique a conexão e tente de novo.'
  }
  return 'Não foi possível salvar. Verifique a conexão e tente de novo.'
}
