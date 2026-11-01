import { createClient } from '@supabase/supabase-js'
import { idValido } from '@/lib/cadastros'
import { linkConfirmacao } from '@/lib/confirmacao-sindico'
import {
  avaliarOrigemPublica,
  chaveTokenLink,
  cifrarTokenLink,
  decifrarTokenLink,
  destinoWhatsapp,
  hashTokenConfirmacao,
  mensagemWhatsapp,
} from '@/lib/whatsapp-comprovante'
import { mensagemDoMotivo, resumoEnvio, type MotivoEnvio } from '@/lib/whatsapp-comprovante-resumo'

export { mensagemDoMotivo, resumoEnvio }
export type { ClasseEnvio, LinhaEnvio, MotivoEnvio, ResumoEnvio } from '@/lib/whatsapp-comprovante-resumo'

function clienteServico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return null
  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function objeto(valor: unknown) {
  return valor && typeof valor === 'object' ? valor as Record<string, unknown> : null
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : ''
}

function motivo(valor: unknown): MotivoEnvio | null {
  const codigo = texto(valor)
  if (
    codigo === 'sem_link'
    || codigo === 'encerrado'
    || codigo === 'sem_cifrado'
    || codigo === 'sem_whatsapp'
    || codigo === 'destinatario'
  ) return codigo
  return null
}

export async function lerResumoEnvio(manutencaoId: string) {
  if (!idValido(manutencaoId)) return { estado: 'indisponivel' as const }
  const cliente = clienteServico()
  if (!cliente) return { estado: 'indisponivel' as const }
  const { data, error } = await cliente.rpc('resumo_envio_whatsapp', { p_manutencao_id: manutencaoId })
  if (error) return { estado: 'indisponivel' as const }
  const resumo = resumoEnvio(data)
  if (!resumo) return { estado: 'indisponivel' as const }
  return { estado: 'ok' as const, resumo }
}

export async function emitirLinkCifrado(
  cliente: NonNullable<ReturnType<typeof clienteServico>>,
  manutencaoId: string,
  token: string,
  adminId: string,
) {
  const chave = chaveTokenLink(process.env.TOKEN_LINK_CHAVE)
  if (!chave) return { cifrado: false as const }
  const hash = hashTokenConfirmacao(token)
  const cifrado = hash ? cifrarTokenLink(token, chave, hash) : null
  if (!hash || !cifrado) return { cifrado: true as const, erro: 'Não foi possível gerar o link.' }
  const { error } = await cliente.rpc('emitir_link_confirmacao_cifrado', {
    p_manutencao_id: manutencaoId,
    p_token_hash: hash,
    p_cifrado: cifrado,
    p_emitido_por: adminId,
  })
  return { cifrado: true as const, erro: error ? error.message : null }
}

export function montarPreparacao(entrada: {
  bruto: unknown
  chave: Buffer
  origem: { origem: string; abrirWhatsapp: boolean }
  lembrete?: boolean
}): { modo: 'abrir'; destino: string } | { modo: 'laboratorio'; mensagem: string } | { erro: string } {
  const lido = objeto(entrada.bruto)
  const codigo = motivo(lido?.erro)
  if (codigo) return { erro: mensagemDoMotivo(codigo) }
  const bloco = texto(lido?.cifrado)
  const hash = texto(lido?.token_hash)
  const condominio = texto(lido?.condominio)
  const whatsapp = texto(lido?.whatsapp)
  const token = decifrarTokenLink(bloco, entrada.chave, hash)
  const url = token ? linkConfirmacao(entrada.origem.origem, token) : null
  const mensagem = url ? mensagemWhatsapp(condominio, url, entrada.lembrete === true) : null
  if (!mensagem || !url?.startsWith(`${entrada.origem.origem}/c/`)) return { erro: 'Não foi possível preparar a mensagem.' }
  if (!entrada.origem.abrirWhatsapp) return { modo: 'laboratorio', mensagem }
  const destino = destinoWhatsapp(whatsapp, mensagem)
  if (!destino) return { erro: 'O WhatsApp de quem recebe os comprovantes não pôde ser usado.' }
  return { modo: 'abrir', destino }
}

export async function prepararEnvioDoAdm(entrada: {
  manutencaoId: string
  adminId: string
  hostPedido: string
  origemConfigurada?: string
}): Promise<{ modo: 'abrir'; destino: string } | { modo: 'laboratorio'; mensagem: string } | { erro: string }> {
  if (!idValido(entrada.manutencaoId) || !idValido(entrada.adminId)) {
    return { erro: 'Sem permissão para esta alteração.' }
  }
  const origem = avaliarOrigemPublica(
    entrada.origemConfigurada ?? process.env.APP_PUBLIC_ORIGIN,
    entrada.hostPedido,
  )
  if (!origem) return { erro: 'O endereço público do sistema ainda não está autorizado.' }
  const chave = chaveTokenLink(process.env.TOKEN_LINK_CHAVE)
  if (!chave) return { erro: 'O envio pelo WhatsApp ainda não está disponível neste ambiente.' }
  const cliente = clienteServico()
  if (!cliente) return { erro: 'O envio pelo WhatsApp ainda não está disponível neste ambiente.' }
  const { data, error } = await cliente.rpc('ler_cifrado_para_envio', {
    p_manutencao_id: entrada.manutencaoId,
    p_admin: entrada.adminId,
  })
  if (error) return { erro: error.message }
  const leitura = await lerResumoEnvio(entrada.manutencaoId)
  if (leitura.estado !== 'ok' && !objeto(data)?.erro) {
    return { erro: 'Não foi possível preparar a mensagem.' }
  }
  const lembrete = leitura.estado === 'ok' && leitura.resumo.historico.some((linha) => (
    linha.classe === 'envio' && !linha.correcaoEm
  ))
  return montarPreparacao({ bruto: data, chave, origem, lembrete })
}

export async function registrarEnvioDoAdm(entrada: {
  manutencaoId: string
  adminId: string
  acao: 'confirmar' | 'correcao'
  referenciaId?: string | null
}) {
  if (!idValido(entrada.manutencaoId) || !idValido(entrada.adminId)) {
    return { erro: 'Sem permissão para esta alteração.' }
  }
  if (entrada.acao === 'correcao' && !idValido(entrada.referenciaId ?? '')) {
    return { erro: 'Não há envio para corrigir.' }
  }
  const cliente = clienteServico()
  if (!cliente) return { erro: 'O envio pelo WhatsApp ainda não está disponível neste ambiente.' }
  const { data, error } = await cliente.rpc('registrar_comunicacao_comprovante', {
    p_manutencao_id: entrada.manutencaoId,
    p_admin: entrada.adminId,
    p_acao: entrada.acao,
    p_referencia: entrada.referenciaId ?? null,
  })
  if (error) return { erro: error.message }
  const classe = texto(objeto(data)?.classe)
  if (classe !== 'envio' && classe !== 'lembrete' && classe !== 'correcao') {
    return { erro: 'Não foi possível registrar o envio.' }
  }
  return { classe }
}
