import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  acessoLiberado,
  assinarDesbloqueio,
  avaliarPin,
  BLOQUEIO_MS,
  conferirSegredo,
  hashAtivacao,
  hashPin,
  lerDesbloqueio,
  LIMITE_BLOQUEIOS,
  LIMITE_TENTATIVAS,
  linkAtivacao,
  passoPrestador,
  pinAceito,
  textoSituacaoAcesso,
  tokenAtivacaoValido,
  type ContaTentativas,
} from './desbloqueio.ts'

const zerada: ContaTentativas = { tentativas: 0, bloqueios: 0, bloqueadoAte: null }
const agora = 1_700_000_000_000

test('PIN é exatamente três dígitos', () => {
  assert.equal(pinAceito('007'), true)
  assert.equal(pinAceito('123'), true)
  assert.equal(pinAceito('12'), false)
  assert.equal(pinAceito('1234'), false)
  assert.equal(pinAceito('12a'), false)
  assert.equal(pinAceito(' 123'), false)
  assert.equal(pinAceito(''), false)
})

test('PIN fica ilegível e a conferência não aceita outro valor', async () => {
  const hash = await hashPin('007')
  assert.ok(hash)
  assert.notEqual(hash, '007')
  assert.equal(/^\d{3}$/.test(hash), false)
  assert.equal(await conferirSegredo('007', hash), true)
  assert.equal(await conferirSegredo('008', hash), false)
  assert.equal(await conferirSegredo('07', hash), false)
  assert.equal(await hashPin('12'), null)
})

test('tentativas repetidas pausam e depois exigem nova ativação', () => {
  let conta: ContaTentativas = zerada
  for (let i = 0; i < LIMITE_TENTATIVAS - 1; i += 1) {
    const passo = avaliarPin(conta, agora, false)
    assert.equal(passo.tipo, 'recusado')
    if (passo.tipo === 'recusado') conta = passo.conta
  }
  const pausa = avaliarPin(conta, agora, false)
  assert.equal(pausa.tipo, 'recusado')
  if (pausa.tipo !== 'recusado' || pausa.conta.bloqueadoAte === null) {
    assert.fail('a quinta tentativa deveria pausar')
  }
  assert.equal(pausa.conta.bloqueios, 1)
  assert.equal(pausa.conta.bloqueadoAte, agora + BLOQUEIO_MS)
  assert.equal(avaliarPin(pausa.conta, agora + 1_000, true).tipo, 'aguardar')

  conta = { tentativas: LIMITE_TENTATIVAS - 1, bloqueios: LIMITE_BLOQUEIOS - 1, bloqueadoAte: null }
  const revogado = avaliarPin(conta, agora, false)
  assert.equal(revogado.tipo, 'revogar')
  assert.deepEqual(avaliarPin(zerada, agora, true), {
    tipo: 'liberado',
    conta: zerada,
  })
})

test('link de ativação não é senha e não carrega o PIN', () => {
  const token = 'a'.repeat(43)
  assert.equal(tokenAtivacaoValido(token), true)
  assert.equal(tokenAtivacaoValido('curto'), false)
  const hash = hashAtivacao(token)
  assert.notEqual(hash, token)
  const link = linkAtivacao('https://eleva.example/', token)
  assert.equal(link, `https://eleva.example/ativar/${token}`)
  assert.equal(link?.includes(hash), false)
  assert.equal(linkAtivacao('https://eleva.example', 'pin-123'), null)
})

test('desbloqueio do celular exige sessão, selo e prazo', () => {
  const segredo = 'segredo-de-teste'
  const expira = agora + 60_000
  const cookie = assinarDesbloqueio('usuario-1', 'selo-1', expira, segredo)
  const lido = lerDesbloqueio(cookie, segredo, agora)
  assert.deepEqual(lido && { userId: lido.userId, selo: lido.selo }, { userId: 'usuario-1', selo: 'selo-1' })
  assert.equal(acessoLiberado({ userId: 'usuario-1', selo: 'selo-1', cookie: lido }), true)
  assert.equal(acessoLiberado({ userId: 'usuario-1', selo: 'outro', cookie: lido }), false)
  assert.equal(lerDesbloqueio(cookie, 'outra-chave', agora), null)
  assert.equal(lerDesbloqueio(cookie, segredo, expira), null)
  const adulterado = `${cookie.slice(0, -1)}${cookie.endsWith('a') ? 'b' : 'a'}`
  assert.equal(lerDesbloqueio(adulterado, segredo, agora), null)
})

test('sem PIN o prestador define o código; com PIN o celular precisa desbloquear', () => {
  assert.equal(passoPrestador({ pinDefinido: false, desbloqueado: false }), 'definir-pin')
  assert.equal(passoPrestador({ pinDefinido: false, desbloqueado: true }), 'definir-pin')
  assert.equal(passoPrestador({ pinDefinido: true, desbloqueado: false }), 'desbloquear')
  assert.equal(passoPrestador({ pinDefinido: true, desbloqueado: true }), 'operar')
  assert.equal(textoSituacaoAcesso({ temLogin: true, pinDefinido: true, ativacaoPendente: false, ativacaoExpirada: false }), 'Acesso ao aplicativo: ativo no celular')
  assert.equal(textoSituacaoAcesso({ temLogin: false, pinDefinido: false, ativacaoPendente: false, ativacaoExpirada: false }), 'Acesso ao aplicativo: Não')
})

test('o PIN não entra no login e a ativação não usa o PIN como senha', () => {
  const pin = fs.readFileSync('app/prestador/acesso.ts', 'utf8')
  const ativar = fs.readFileSync('app/ativar/acoes.ts', 'utf8')
  const login = fs.readFileSync('app/acoes.ts', 'utf8')
  assert.equal(pin.includes('signInWithPassword'), false)
  assert.equal(/password:\s*pin|password:\s*formData/.test(ativar), false)
  assert.match(ativar, /signInWithPassword/)
  assert.match(login, /signInWithPassword/)
  assert.equal(login.includes('pin'), false)
})
