import assert from 'node:assert/strict'
import test from 'node:test'
import { consultarCep, interpretarViaCep, mascaraCep } from './cep.ts'
import { validarCondominio } from './cadastros.ts'

const condominio = {
  nome: 'Porta do Sol',
  cep: '01001-000',
  endereco: 'Rua digitada',
  numero: '',
  complemento: 'Bloco B',
  bairro: 'Centro',
  cidade: 'Campinas',
  estado: 'SP',
  quantidadeUnidades: '',
  observacoes: '',
}

test('CEP válido preenche logradouro, bairro, cidade e UF', async () => {
  assert.equal(mascaraCep('01001000'), '01001-000')
  const endereco = interpretarViaCep({
    logradouro: 'Praça da Sé',
    complemento: 'lado ímpar',
    bairro: 'Sé',
    localidade: 'São Paulo',
    uf: 'SP',
  })
  assert.deepEqual(endereco, {
    endereco: 'Praça da Sé',
    bairro: 'Sé',
    cidade: 'São Paulo',
    estado: 'SP',
  })
  assert.equal('complemento' in (endereco ?? {}), false)

  let chamado = ''
  const resultado = await consultarCep('01001-000', (async (url) => {
    chamado = String(url)
    return new Response(JSON.stringify({
      logradouro: 'Praça da Sé',
      complemento: 'lado ímpar',
      bairro: 'Sé',
      localidade: 'São Paulo',
      uf: 'SP',
    }))
  }) as typeof fetch)
  assert.match(chamado, /01001000/)
  assert.equal(resultado.ok, true)
  if (resultado.ok) assert.equal(resultado.endereco.endereco, 'Praça da Sé')
})

test('CEP inválido ou inexistente não bloqueia o cadastro manual', async () => {
  const invalido = await consultarCep('123', (async () => {
    throw new Error('não deveria consultar')
  }) as typeof fetch)
  assert.equal(invalido.ok, false)
  if (!invalido.ok) assert.equal(invalido.bloqueiaCadastro, false)
  assert.match(invalido.mensagem, /manualmente/)

  const inexistente = await consultarCep('00000000', (async () => new Response(JSON.stringify({ erro: true }))) as typeof fetch)
  assert.equal(inexistente.ok, false)
  if (!inexistente.ok) assert.equal(inexistente.bloqueiaCadastro, false)
  assert.match(inexistente.mensagem, /não encontrado/)

  const salvo = validarCondominio({ ...condominio, cep: '00000-000' })
  assert.equal(salvo.erro, null)
  assert.equal(salvo.dados?.complemento, 'Bloco B')
  assert.equal(salvo.dados?.numero, null)
})

test('falha da consulta de CEP não bloqueia o cadastro', async () => {
  const fora = await consultarCep('01001000', (async () => {
    throw new Error('rede')
  }) as typeof fetch)
  assert.equal(fora.ok, false)
  if (!fora.ok) assert.equal(fora.bloqueiaCadastro, false)

  const http = await consultarCep('01001000', (async () => new Response('erro', { status: 503 })) as typeof fetch)
  assert.equal(http.ok, false)
  if (!http.ok) assert.equal(http.bloqueiaCadastro, false)

  const salvo = validarCondominio(condominio)
  assert.equal(salvo.erro, null)
  assert.equal(salvo.dados?.endereco, 'Rua digitada')
})
