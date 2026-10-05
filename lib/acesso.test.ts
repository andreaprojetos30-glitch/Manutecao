import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { destinoOperacional, redirecionar } from './acesso.ts'

test('perfil explícito define a área', () => {
  assert.equal(destinoOperacional('admin', true), '/adm')
  assert.equal(destinoOperacional('prestador', true), '/prestador')
  assert.equal(destinoOperacional(null, true), '/sem-acesso')
  assert.equal(destinoOperacional(undefined, true), '/sem-acesso')
  assert.equal(destinoOperacional('sindico', true), '/sem-acesso')
  assert.equal(destinoOperacional('admin', false), '/sem-acesso')
  assert.equal(destinoOperacional('prestador', false), '/sem-acesso')
})

test('anônimo só permanece no login', () => {
  const base = { autenticado: false, perfil: null, ativo: false }
  assert.equal(redirecionar({ ...base, pathname: '/login' }), null)
  assert.equal(redirecionar({ ...base, pathname: '/adm' }), '/login')
  assert.equal(redirecionar({ ...base, pathname: '/prestador' }), '/login')
  assert.equal(redirecionar({ ...base, pathname: '/sem-acesso' }), '/login')
  assert.equal(redirecionar({ ...base, pathname: '/' }), '/login')
})

test('cada perfil fica na própria área', () => {
  const admin = { autenticado: true, perfil: 'admin', ativo: true }
  assert.equal(redirecionar({ ...admin, pathname: '/adm' }), null)
  assert.equal(redirecionar({ ...admin, pathname: '/adm/contratos' }), null)
  assert.equal(redirecionar({ ...admin, pathname: '/prestador' }), '/adm')
  assert.equal(redirecionar({ ...admin, pathname: '/sem-acesso' }), '/adm')
  assert.equal(redirecionar({ ...admin, pathname: '/login' }), '/adm')

  const prestador = { autenticado: true, perfil: 'prestador', ativo: true }
  assert.equal(redirecionar({ ...prestador, pathname: '/prestador' }), null)
  assert.equal(redirecionar({ ...prestador, pathname: '/adm' }), '/prestador')
  assert.equal(redirecionar({ ...prestador, pathname: '/' }), '/prestador')

  const semPerfil = { autenticado: true, perfil: null, ativo: true }
  assert.equal(redirecionar({ ...semPerfil, pathname: '/sem-acesso' }), null)
  assert.equal(redirecionar({ ...semPerfil, pathname: '/adm' }), '/sem-acesso')
  assert.equal(redirecionar({ ...semPerfil, pathname: '/prestador' }), '/sem-acesso')
  assert.equal(redirecionar({ ...semPerfil, pathname: '/login' }), '/sem-acesso')
})

test('login não oferece autocadastro', () => {
  const login = fs.readFileSync('app/login/page.tsx', 'utf8')
  const acoes = fs.readFileSync('app/acoes.ts', 'utf8')
  const texto = `${login}\n${acoes}`
  assert.equal(/signUp|cadastr/i.test(texto), false)
})
