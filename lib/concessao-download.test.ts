import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { caminhoLiberado } from './comprovante-armazenamento.ts'
import { leituraDoLink, modoPdfPublico } from './confirmacao-sindico.ts'
import {
  PRAZO_CONCESSAO_SEGUNDOS,
  abrirConcessao,
  emitirConcessao,
  opcoesCookieConcessao,
} from './concessao-download.ts'

const ID_A = 'a1111111-1111-4111-8111-111111111111'
const ID_B = 'a7777777-7777-4777-8777-777777777777'
const AGORA = 1_700_000_000
const SEGREDO = 'segredo-de-teste-somente'

test('a concessão dura 30 minutos, é assinada e não vale para outra manutenção', () => {
  const valor = emitirConcessao(ID_A, AGORA, SEGREDO)
  assert.ok(valor)
  const aberta = abrirConcessao(valor!, AGORA + 1, SEGREDO)
  assert.equal(aberta?.manutencaoId, ID_A)
  assert.equal(abrirConcessao(valor!, AGORA + PRAZO_CONCESSAO_SEGUNDOS, SEGREDO), null)
  assert.equal(abrirConcessao(valor!, AGORA + PRAZO_CONCESSAO_SEGUNDOS - 1, SEGREDO)?.manutencaoId, ID_A)
  assert.equal(abrirConcessao(valor!, AGORA, 'outro-segredo'), null)
  assert.equal(abrirConcessao(`${valor}x`, AGORA + 1, SEGREDO), null)
  assert.equal(emitirConcessao(ID_A, AGORA, ''), null)

  const opcoes = opcoesCookieConcessao('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ', true)
  assert.equal(opcoes.httpOnly, true)
  assert.equal(opcoes.sameSite, 'lax')
  assert.equal(opcoes.secure, true)
  assert.equal(opcoes.maxAge, PRAZO_CONCESSAO_SEGUNDOS)
  assert.equal(opcoesCookieConcessao('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ', false).secure, false)

  const encerrada = leituraDoLink({
    situacao: 'encerrada',
    manutencao_id: ID_A,
    caminho_pdf: `${ID_B}/comprovante.pdf`,
    condominio: 'Não mostrar',
  })
  assert.equal(encerrada?.estado, 'encerrada')
  assert.equal(modoPdfPublico(encerrada, aberta)?.modo, 'attachment')
  assert.equal(modoPdfPublico(encerrada, aberta)?.caminho, `${ID_A}/comprovante.pdf`)
  assert.equal(modoPdfPublico(encerrada, { manutencaoId: ID_B }), null)
  assert.equal(modoPdfPublico(encerrada, null), null)
  assert.equal(JSON.stringify(encerrada).includes('Não mostrar'), false)
  assert.equal(JSON.stringify(encerrada).includes(ID_B), false)
})

test('o administrativo só abre o comprovante da própria manutenção', () => {
  assert.equal(caminhoLiberado(`${ID_A}/comprovante.pdf`, ID_A), `${ID_A}/comprovante.pdf`)
  assert.equal(caminhoLiberado(`${ID_B}/comprovante.pdf`, ID_A), null)
  assert.equal(caminhoLiberado('https://arquivos.example/comprovante.pdf', ID_A), null)
  const rota = fs.readFileSync('app/adm/manutencoes/[id]/comprovante/route.ts', 'utf8')
  const pronto = fs.readFileSync('app/c/[token]/pronto/page.tsx', 'utf8')
  const original = fs.readFileSync('app/c/[token]/page.tsx', 'utf8')
  assert.equal(rota.includes("exigirDestino('/adm')"), true)
  assert.equal(rota.includes('p_token'), false)
  assert.equal(pronto.includes('CartaoPronto'), true)
  assert.equal(pronto.includes('CartaoEncerrado'), true)
  assert.equal(original.includes('CartaoEncerrado'), true)
  assert.equal(original.includes('leitura-pdf'), false)
  assert.equal(/wa\.me|api\.whatsapp/i.test(`${rota}\n${pronto}\n${original}`), false)
})
