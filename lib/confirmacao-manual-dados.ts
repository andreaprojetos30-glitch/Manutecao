import { createClient } from '@supabase/supabase-js'
import { idValido } from '@/lib/cadastros'
import { clienteAdm } from '@/lib/adm'
import { BUCKET_PDFS, pdfGerado } from '@/lib/comprovante-armazenamento'
import { bytesDeDownload } from '@/lib/confirmacao-sindico'
import {
  caminhoDocumentoConfirmacao,
  documentoConfirmacao,
  garantiaDocumento,
  resumoConfirmacaoManual,
} from '@/lib/confirmacao-manual'

function clienteServico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) return null
  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function administrador() {
  const supabase = await clienteAdm()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id && idValido(user.id) ? user.id : null
}

export async function lerResumoConfirmacaoManual(manutencaoId: string) {
  if (!idValido(manutencaoId)) return { estado: 'indisponivel' as const }
  const adminId = await administrador()
  const servico = clienteServico()
  if (!adminId || !servico) return { estado: 'indisponivel' as const }
  const { data, error } = await servico.rpc('resumo_confirmacao_comprovante', {
    p_admin: adminId,
    p_manutencao_id: manutencaoId,
  })
  if (error) return { estado: 'indisponivel' as const }
  const resumo = resumoConfirmacaoManual(data)
  if (!resumo) return { estado: 'indisponivel' as const }
  return { estado: 'ok' as const, resumo }
}

export async function registrarConfirmacaoManualDoAdm(adminId: string, manutencaoId: string, justificativa: string) {
  const servico = clienteServico()
  if (!servico || !idValido(adminId) || !idValido(manutencaoId)) return { erro: 'Sem permissão para esta alteração.' }
  const { error } = await servico.rpc('registrar_confirmacao_manual', {
    p_admin: adminId,
    p_manutencao_id: manutencaoId,
    p_justificativa: justificativa,
  })
  if (error) return { erro: error.message }
  return { ok: true as const }
}

export async function corrigirConfirmacaoManualDoAdm(
  adminId: string,
  manutencaoId: string,
  registroId: string,
  justificativa: string,
) {
  const servico = clienteServico()
  if (!servico || !idValido(adminId) || !idValido(manutencaoId) || !idValido(registroId)) {
    return { erro: 'Sem permissão para esta alteração.' }
  }
  const { error } = await servico.rpc('corrigir_confirmacao_manual', {
    p_admin: adminId,
    p_manutencao_id: manutencaoId,
    p_registro_id: registroId,
    p_justificativa: justificativa,
  })
  if (error) return { erro: error.message }
  return { ok: true as const }
}

export async function garantirDocumentoDoAdm(
  adminId: string,
  manutencaoId: string,
  tipo: 'link' | 'registro' | 'declaracao',
  alvo: string | null,
) {
  const servico = clienteServico()
  if (!servico || !idValido(adminId) || !idValido(manutencaoId)) return { erro: 'Sem permissão para esta alteração.' as const }
  if (tipo !== 'link' && !idValido(alvo ?? '')) return { erro: 'Não há confirmação manual para este documento.' as const }
  const { data, error } = await servico.rpc('garantir_documento_confirmacao', {
    p_admin: adminId,
    p_manutencao_id: manutencaoId,
    p_tipo: tipo,
    p_alvo: alvo,
  })
  if (error) return { erro: error.message }
  const garantia = garantiaDocumento(data)
  if (!garantia || !garantia.caminho.startsWith(`${manutencaoId.toLowerCase()}/confirmacoes/`)) {
    return { erro: 'O comprovante de confirmação não pôde ser gerado.' }
  }
  return { garantia }
}

export async function lerDocumentoDoAdm(adminId: string, manutencaoId: string, codigo: string) {
  const servico = clienteServico()
  const caminho = caminhoDocumentoConfirmacao(manutencaoId, codigo)
  if (!servico || !idValido(adminId) || !caminho) return null
  const { data, error } = await servico.rpc('ler_documento_confirmacao', {
    p_admin: adminId,
    p_manutencao_id: manutencaoId,
    p_codigo: codigo,
  })
  if (error) return null
  const documento = documentoConfirmacao(data)
  if (!documento || documento.caminho !== caminho) return null
  return documento
}

function armazenamentoExistente(message: string) {
  return /already exists|duplicate|já existe|ja existe/i.test(message) && !/https?:\/\//i.test(message)
}

export async function baixarDocumentoConfirmacao(caminho: string) {
  if (caminho.includes('comprovante.pdf') || !caminho.includes('/confirmacoes/')) return null
  const servico = clienteServico()
  if (!servico) return null
  const { data, error } = await servico.storage.from(BUCKET_PDFS).download(caminho)
  if (error || !data) return null
  const bytes = await bytesDeDownload(data)
  if (!bytes || !pdfGerado(bytes)) return null
  return bytes
}

export async function guardarDocumentoConfirmacao(caminho: string, pdf: Uint8Array) {
  if (caminho.includes('comprovante.pdf') || !caminho.includes('/confirmacoes/') || !pdfGerado(pdf)) {
    return { erro: 'O comprovante de confirmação não foi armazenado.' }
  }
  const servico = clienteServico()
  if (!servico) return { erro: 'O comprovante de confirmação não foi armazenado.' }
  const { error } = await servico.storage.from(BUCKET_PDFS).upload(caminho, pdf, {
    contentType: 'application/pdf',
    upsert: false,
  })
  if (error && !armazenamentoExistente(error.message)) return { erro: 'O comprovante de confirmação não foi armazenado.' }
  return { erro: null }
}
