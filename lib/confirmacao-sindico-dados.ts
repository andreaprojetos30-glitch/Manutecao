import { createClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'
import { idValido } from '@/lib/cadastros'
import { BUCKET_PDFS, pdfGerado } from '@/lib/comprovante-armazenamento'
import {
  abrirConcessao,
  emitirConcessao,
  NOME_COOKIE_CONCESSAO,
  opcoesCookieConcessao,
} from '@/lib/concessao-download'
import {
  bytesDeDownload,
  executarConfirmacao,
  executarEmissao,
  leituraDoLink,
  modoPdfPublico,
  novoTokenConfirmacao,
  origemConfirmacao,
  resumoDoLink,
  tokenConfirmacaoValido,
} from '@/lib/confirmacao-sindico'

function clienteServico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return null
  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function segredoConcessao() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
}

export async function lerLinkPublico(token: string) {
  if (!tokenConfirmacaoValido(token)) return null
  const cliente = clienteServico()
  if (!cliente) return null
  const { data, error } = await cliente.rpc('ler_link_confirmacao_sindico', { p_token: token })
  if (error) return null
  return leituraDoLink(data)
}

export async function concessaoDoPedido() {
  const valor = (await cookies()).get(NOME_COOKIE_CONCESSAO)?.value ?? ''
  return abrirConcessao(valor, Math.floor(Date.now() / 1000), segredoConcessao())
}

export async function gravarConcessao(token: string, manutencaoId: string, seguro: boolean) {
  if (!tokenConfirmacaoValido(token)) return false
  const valor = emitirConcessao(manutencaoId, Math.floor(Date.now() / 1000), segredoConcessao())
  if (!valor) return false
  ;(await cookies()).set(NOME_COOKIE_CONCESSAO, valor, opcoesCookieConcessao(token, seguro))
  return true
}

export async function lerResumoConfirmacao(manutencaoId: string) {
  if (!idValido(manutencaoId)) return { estado: 'indisponivel' as const }
  const cliente = clienteServico()
  if (!cliente) return { estado: 'indisponivel' as const }
  const { data, error } = await cliente.rpc('resumo_link_confirmacao_sindico', {
    p_manutencao_id: manutencaoId,
  })
  if (error) return { estado: 'indisponivel' as const }
  const resumo = resumoDoLink(data)
  if (!resumo) return { estado: 'indisponivel' as const }
  return { estado: 'ok' as const, resumo }
}

export async function confirmarPeloToken(token: string) {
  const cliente = clienteServico()
  if (!cliente) return { estado: 'indisponivel' as const }
  return executarConfirmacao(token, {
    async ler(valor) {
      const { data, error } = await cliente.rpc('ler_link_confirmacao_sindico', { p_token: valor })
      if (error) return null
      return data
    },
    async registrar(valor) {
      const { error } = await cliente.rpc('registrar_confirmacao_sindico', { p_token: valor })
      return { erro: error ? error.message : null }
    },
  })
}

export async function emitirLinkDoAdm(entrada: {
  manutencaoId: string
  adminId: string
  host: string
  proto: string
  prepararCifrado?: (
    cliente: NonNullable<ReturnType<typeof clienteServico>>,
    manutencaoId: string,
    token: string,
    adminId: string,
  ) => Promise<{ cifrado: false } | { cifrado: true; erro: string | null }>
}): Promise<{ url: string } | { erro: string }> {
  const cliente = clienteServico()
  if (!cliente) return { erro: 'A confirmação do síndico ainda não está disponível neste ambiente.' }
  return executarEmissao({
    manutencaoId: entrada.manutencaoId,
    adminId: entrada.adminId,
    origem: origemConfirmacao(entrada.host, entrada.proto),
    gerarToken: novoTokenConfirmacao,
    async emitir(manutencaoId, token, adminId) {
      if (entrada.prepararCifrado) {
        const cifrado = await entrada.prepararCifrado(cliente, manutencaoId, token, adminId)
        if (cifrado.cifrado) return { erro: cifrado.erro }
      }
      const { error } = await cliente.rpc('emitir_link_confirmacao_sindico', {
        p_manutencao_id: manutencaoId,
        p_token: token,
        p_emitido_por: adminId,
      })
      return { erro: error ? error.message : null }
    },
    async revogar(manutencaoId, adminId) {
      const { error } = await cliente.rpc('revogar_link_confirmacao_sindico', {
        p_manutencao_id: manutencaoId,
        p_revogado_por: adminId,
      })
      return { erro: error ? error.message : null }
    },
  })
}

export async function revogarLinkDoAdm(manutencaoId: string, adminId: string) {
  const cliente = clienteServico()
  if (!cliente) return { erro: 'A confirmação do síndico ainda não está disponível neste ambiente.' }
  const { error } = await cliente.rpc('revogar_link_confirmacao_sindico', {
    p_manutencao_id: manutencaoId,
    p_revogado_por: adminId,
  })
  return { erro: error ? error.message : null }
}

export async function pdfDoLink(token: string, concessao: { manutencaoId: string } | null) {
  const cliente = clienteServico()
  if (!cliente) return null
  if (!tokenConfirmacaoValido(token)) return null
  const { data, error } = await cliente.rpc('ler_link_confirmacao_sindico', { p_token: token })
  if (error) return null
  const modo = modoPdfPublico(leituraDoLink(data), concessao)
  if (!modo) return null
  const { data: arquivo, error: falha } = await cliente.storage.from(BUCKET_PDFS).download(modo.caminho)
  if (falha || !arquivo) return null
  const bytes = await bytesDeDownload(arquivo)
  if (!bytes || !pdfGerado(bytes)) return null
  return { bytes, disposicao: modo.modo }
}

export async function origemDaRequisicao() {
  const cabecalho = await headers()
  const host = cabecalho.get('x-forwarded-host') ?? cabecalho.get('host') ?? ''
  const proto = cabecalho.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return { host, proto }
}
