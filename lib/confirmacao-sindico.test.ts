import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { mensagemManutencao } from './manutencoes.ts'
import {
  entregarPdfDoLink,
  executarConfirmacao,
  executarEmissao,
  linkConfirmacao,
  novoTokenConfirmacao,
  origemConfirmacao,
  paginaDoLink,
  resumoDoLink,
  tokenConfirmacaoValido,
  vistaPublica,
} from './confirmacao-sindico.ts'

const ID_A = 'a1111111-1111-4111-8111-111111111111'
const ID_B = 'a7777777-7777-4777-8777-777777777777'
const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
const ADMIN = '00000000-0000-4000-8000-000000000001'

function pdfMinimo() {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
}

function paginaBruta(extra: Record<string, unknown> = {}) {
  return {
    manutencao_id: ID_A,
    condominio: 'Porta do Sol',
    tipo: 'preventiva',
    numero_visita: 7,
    quantidade_visitas: 12,
    data_efetiva: '2026-10-25',
    caminho_pdf: `${ID_A}/comprovante.pdf`,
    confirmado_em: null,
    sindico_nome: null,
    meio: null,
    descricao_original: 'SEGREDO-OCORRENCIA-INTERNA',
    ocorrencias: [{ foto: 'SEGREDO-FOTO' }],
    condominio_alheio: 'Outro Predio',
    ...extra,
  }
}

test('o token do link é aleatório e a URL não leva o id da manutenção', () => {
  const primeiro = novoTokenConfirmacao()
  const segundo = novoTokenConfirmacao()
  assert.equal(tokenConfirmacaoValido(primeiro), true)
  assert.equal(tokenConfirmacaoValido('curto'), false)
  assert.notEqual(primeiro, segundo)
  const link = linkConfirmacao('https://eleva.example/', primeiro)
  assert.equal(link, `https://eleva.example/c/${primeiro}`)
  assert.equal(link?.includes(ID_A), false)
  assert.equal(linkConfirmacao('https://eleva.example', 'curto'), null)
  assert.equal(origemConfirmacao('eleva.example, interno', 'https'), 'https://eleva.example')
  assert.equal(origemConfirmacao('evil.test/c', 'https'), '')
})

test('a página pública fica só com os dados daquela manutenção', () => {
  const pagina = paginaDoLink(paginaBruta())
  assert.ok(pagina)
  assert.equal(pagina?.titulo, 'VISITA 7/12')
  const vista = vistaPublica(pagina!)
  const texto = JSON.stringify(vista)
  assert.equal(vista.identificacao, 'ELEVA')
  assert.equal(texto.includes('SEGREDO'), false)
  assert.equal(texto.includes('Outro Predio'), false)
  assert.equal(texto.includes(ID_A), false)
  assert.equal(texto.includes('comprovante.pdf'), false)
  assert.equal(paginaDoLink(paginaBruta({ caminho_pdf: `${ID_B}/comprovante.pdf` })), null)
  const outra = paginaDoLink(paginaBruta({
    manutencao_id: ID_B,
    condominio: 'Outro Predio',
    caminho_pdf: `${ID_B}/comprovante.pdf`,
  }))
  assert.equal(outra?.condominio, 'Outro Predio')
  assert.equal(JSON.stringify(vistaPublica(outra!)).includes('Porta do Sol'), false)
  assert.equal(JSON.stringify(vistaPublica(outra!)).includes('SEGREDO'), false)
})

test('o resumo do ADM não carrega o token', () => {
  const resumo = resumoDoLink({
    link_ativo: true,
    emitido_em: '2026-10-25T15:00:00Z',
    confirmado_em: '2026-10-25T18:00:00Z',
    sindico_nome: 'Helena',
    meio: 'link',
    token: TOKEN,
    token_hash: 'sha256$segredo',
  })
  assert.deepEqual(resumo, {
    linkAtivo: true,
    emitidoEm: '2026-10-25T15:00:00Z',
    confirmadoEm: '2026-10-25T18:00:00Z',
    sindicoNome: 'Helena',
    meio: 'link',
  })
  assert.equal(JSON.stringify(resumo).includes(TOKEN), false)
})

test('o PDF só é lido depois do token e no caminho da própria manutenção', async () => {
  let consultas = 0
  let baixado: string | null = null
  const invalido = await entregarPdfDoLink({
    token: 'curto',
    consultar: async () => {
      consultas += 1
      return paginaBruta()
    },
    baixar: async (caminho) => {
      baixado = caminho
      return pdfMinimo()
    },
  })
  assert.equal(invalido, null)
  assert.equal(consultas, 0)
  assert.equal(baixado, null)

  const cruzado = await entregarPdfDoLink({
    token: TOKEN,
    consultar: async () => paginaBruta({ caminho_pdf: `${ID_B}/comprovante.pdf` }),
    baixar: async (caminho) => {
      baixado = caminho
      return pdfMinimo()
    },
  })
  assert.equal(cruzado, null)
  assert.equal(baixado, null)

  const entregue = await entregarPdfDoLink({
    token: TOKEN,
    consultar: async () => paginaBruta(),
    baixar: async (caminho) => {
      baixado = caminho
      return pdfMinimo()
    },
  })
  assert.equal(baixado, `${ID_A}/comprovante.pdf`)
  assert.equal(entregue?.bytes[0], 0x25)
})

test('confirmação duplicada, revogada e sem síndico não gravam de novo', async () => {
  let registros = 0
  const ja = await executarConfirmacao(TOKEN, {
    async ler() {
      return paginaBruta({ confirmado_em: '2026-10-25T18:04:00Z', sindico_nome: 'Helena', meio: 'link' })
    },
    async registrar() {
      registros += 1
      return { erro: null }
    },
  })
  assert.equal(ja.estado, 'ja_confirmada')
  assert.equal(registros, 0)

  const revogado = await executarConfirmacao(TOKEN, {
    async ler() {
      return null
    },
    async registrar() {
      registros += 1
      return { erro: null }
    },
  })
  assert.equal(revogado.estado, 'indisponivel')
  assert.equal(registros, 0)

  const semSindico = await executarConfirmacao(TOKEN, {
    async ler() {
      return paginaBruta()
    },
    async registrar() {
      registros += 1
      return { erro: 'Não há síndico ativo neste condomínio' }
    },
  })
  assert.equal(semSindico.estado, 'sem_sindico')
  assert.equal(registros, 1)

  let leituras = 0
  const corrida = await executarConfirmacao(TOKEN, {
    async ler() {
      leituras += 1
      if (leituras === 1) return paginaBruta()
      return paginaBruta({ confirmado_em: '2026-10-25T18:04:00Z', sindico_nome: 'Helena', meio: 'link' })
    },
    async registrar() {
      registros += 1
      return { erro: 'Esta manutenção já tem confirmação' }
    },
  })
  assert.equal(corrida.estado, 'ja_confirmada')
  assert.equal(registros, 2)
  assert.equal(leituras, 2)
})

test('emitir devolve o endereço uma vez e revoga se o id aparecer na URL', async () => {
  const token = novoTokenConfirmacao()
  let revogou = 0
  const emitido = await executarEmissao({
    manutencaoId: ID_A,
    adminId: ADMIN,
    origem: 'https://eleva.example',
    gerarToken: () => token,
    async emitir() {
      return { erro: null }
    },
    async revogar() {
      revogou += 1
      return { erro: null }
    },
  })
  assert.equal('url' in emitido && emitido.url, `https://eleva.example/c/${token}`)
  assert.equal(revogou, 0)

  const tokenComId = `${ID_A}1234567`
  let emissao = 0
  const recusado = await executarEmissao({
    manutencaoId: ID_A,
    adminId: ADMIN,
    origem: 'https://eleva.example',
    gerarToken: () => tokenComId,
    async emitir() {
      emissao += 1
      return { erro: null }
    },
    async revogar() {
      revogou += 1
      return { erro: null }
    },
  })
  assert.deepEqual(recusado, { erro: 'Não foi possível gerar o link.' })
  assert.equal(emissao, 1)
  assert.equal(revogou, 1)
  assert.equal(mensagemManutencao('Este link foi revogado'), 'Este link foi revogado.')
  assert.equal(mensagemManutencao('O comprovante ainda não foi liberado'), 'O comprovante ainda não foi liberado.')
})

test('a página e o PDF não publicam o arquivo nem leem ocorrência', () => {
  const pagina = fs.readFileSync('app/c/[token]/page.tsx', 'utf8')
  const cartao = fs.readFileSync('app/c/CartaoLink.tsx', 'utf8')
  const rota = fs.readFileSync('app/c/[token]/pdf/route.ts', 'utf8')
  const dados = fs.readFileSync('lib/confirmacao-sindico-dados.ts', 'utf8')
  const migration = fs.readFileSync('supabase/migrations/20261025200000_link_confirmacao_sindico.sql', 'utf8')
  const texto = `${pagina}\n${cartao}\n${rota}\n${dados}`
  assert.equal(cartao.includes('Confirmar realização da manutenção'), true)
  assert.equal(cartao.includes('ELEVA'), true)
  assert.equal(/createSignedUrl|getPublicUrl|ocorrencias|descricao_original|whatsapp/i.test(texto), false)
  assert.equal(migration.includes('drop function if exists public.registrar_confirmacao_sindico(uuid, text)'), true)
  assert.equal(/wa\.me|api\.whatsapp/i.test(texto), false)
})
