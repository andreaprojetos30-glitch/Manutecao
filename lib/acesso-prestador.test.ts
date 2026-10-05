import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { credenciaisPrestador, decidirAcessoPrestador, novaSenhaPrestador } from './acesso-prestador.ts'

const idPrestador = '00000000-0000-4000-8000-000000000002'
const idOutro = '00000000-0000-4000-8000-000000000099'

test('acesso Não não cria login e Sim exige e-mail de prestador', () => {
  assert.deepEqual(
    decidirAcessoPrestador({ acesso: 'nao', email: null, usuarioAtual: null, contaEmail: null, perfilAtual: null }),
    { tipo: 'sem-login' },
  )
  assert.deepEqual(
    decidirAcessoPrestador({ acesso: 'nao', email: 'paulo@eleva.test', usuarioAtual: idPrestador, contaEmail: null, perfilAtual: 'prestador' }),
    { tipo: 'desvincular', usuarioId: idPrestador, podeDesativar: true },
  )
  const adminLigado = decidirAcessoPrestador({
    acesso: 'nao',
    email: null,
    usuarioAtual: idPrestador,
    contaEmail: null,
    perfilAtual: 'admin',
  })
  assert.equal(adminLigado.tipo, 'desvincular')
  if (adminLigado.tipo === 'desvincular') assert.equal(adminLigado.podeDesativar, false)

  assert.equal(
    decidirAcessoPrestador({ acesso: 'sim', email: null, usuarioAtual: null, contaEmail: null, perfilAtual: null }).tipo,
    'erro',
  )
  assert.deepEqual(
    decidirAcessoPrestador({ acesso: 'sim', email: 'novo@eleva.test', usuarioAtual: null, contaEmail: null, perfilAtual: null }),
    { tipo: 'criar' },
  )
})

test('login do prestador é só perfil prestador', () => {
  const credenciais = credenciaisPrestador('Paulo', '19999999999', 'paulo@eleva.test', novaSenhaPrestador(() => 'abc123'))
  assert.deepEqual(credenciais.app_metadata, { perfil: 'prestador' })
  assert.equal('perfil' in credenciais.user_metadata, false)
  assert.equal(JSON.stringify(credenciais).includes('admin'), false)
  assert.equal(credenciais.password, 'Eleva-abc123-App')

  const admin = decidirAcessoPrestador({
    acesso: 'sim',
    email: 'administracao@eleva-fit.com.br',
    usuarioAtual: null,
    contaEmail: { id: idOutro, perfil: 'admin', ativo: true, vinculadoAOutro: false },
    perfilAtual: null,
  })
  assert.equal(admin.tipo, 'erro')

  const semPerfil = decidirAcessoPrestador({
    acesso: 'sim',
    email: 'alguem@eleva.test',
    usuarioAtual: null,
    contaEmail: { id: idOutro, perfil: null, ativo: true, vinculadoAOutro: false },
    perfilAtual: null,
  })
  assert.equal(semPerfil.tipo, 'erro')

  const ocupado = decidirAcessoPrestador({
    acesso: 'sim',
    email: 'outro@eleva.test',
    usuarioAtual: null,
    contaEmail: { id: idOutro, perfil: 'prestador', ativo: true, vinculadoAOutro: true },
    perfilAtual: null,
  })
  assert.equal(ocupado.tipo, 'erro')

  assert.deepEqual(
    decidirAcessoPrestador({
      acesso: 'sim',
      email: 'paulo@eleva.test',
      usuarioAtual: null,
      contaEmail: { id: idPrestador, perfil: 'prestador', ativo: false, vinculadoAOutro: false },
      perfilAtual: null,
    }),
    { tipo: 'vincular', usuarioId: idPrestador },
  )
})

test('telas não voltam a pedir ficha técnica nem identificador de acesso', () => {
  const equipamento = fs.readFileSync('app/adm/equipamentos/FormEquipamento.tsx', 'utf8')
  const lista = fs.readFileSync('app/adm/equipamentos/page.tsx', 'utf8')
  const prestador = fs.readFileSync('app/adm/prestadores/FormPrestador.tsx', 'utf8')
  assert.equal(/categoria|fabricante|modelo|observacoes/i.test(equipamento), false)
  assert.equal(/categoria|fabricante|modelo/.test(lista), false)
  assert.equal(/usuario_id|App Metadata|uuid/i.test(prestador), false)
  assert.match(prestador, /Acesso ao aplicativo/)
  assert.match(prestador, /value="nao"/)
})
