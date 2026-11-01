import assert from 'node:assert/strict'
import test from 'node:test'
import { PRAZO_CONFIRMACAO_MS, classificarAcompanhamento, montarListaAcompanhamento } from './acompanhamento-comprovante.ts'
import { cenariosPreviaAcompanhamento, previaLocalPermitida } from './acompanhamento-previa.ts'

const AGORA = new Date('2026-11-04T15:00:00.000Z')

test('a prévia fictícia cobre as quatro situações sem repetir manutenção', () => {
  const itens = cenariosPreviaAcompanhamento(AGORA)
  assert.equal(itens.length, 8)
  assert.equal(new Set(itens.map((item) => item.manutencaoId)).size, 8)
  assert.equal(itens.every((item) => item.condominioNome.startsWith('Condomínio Fictício ')), true)

  const geral = montarListaAcompanhamento({ itens, agora: AGORA, situacao: null, busca: '' })
  const total = geral.contagens.aguardando_envio
    + geral.contagens.aguardando_confirmacao
    + geral.contagens.mais_de_3_dias
    + geral.contagens.confirmados
  assert.equal(total, 8)
  assert.deepEqual(geral.contagens, {
    aguardando_envio: 2,
    aguardando_confirmacao: 2,
    mais_de_3_dias: 2,
    confirmados: 2,
  })

  const exata = itens.find((item) => item.condominioNome.includes('72 horas exatas'))
  const quase = itens.find((item) => item.condominioNome.includes('Quase 72 horas'))
  assert.ok(exata?.primeiroEnvioEm && quase?.primeiroEnvioEm)
  assert.equal(classificarAcompanhamento(exata, AGORA), 'aguardando_confirmacao')
  assert.equal(AGORA.getTime() - Date.parse(exata.primeiroEnvioEm), PRAZO_CONFIRMACAO_MS)
  assert.equal(classificarAcompanhamento({
    confirmadoEm: null,
    primeiroEnvioEm: new Date(Date.parse(exata.primeiroEnvioEm) - 1).toISOString(),
  }, AGORA), 'mais_de_3_dias')
  assert.equal(classificarAcompanhamento(quase, AGORA), 'aguardando_confirmacao')
  assert.equal(AGORA.getTime() - Date.parse(quase.primeiroEnvioEm), 71 * 60 * 60 * 1000)

  const comLembrete = itens.find((item) => item.condominioNome.includes('Com Lembrete'))
  const semLembrete = itens.find((item) => item.condominioNome.includes('Sem Lembrete'))
  assert.ok(comLembrete?.ultimoLembreteEm)
  assert.equal(semLembrete?.ultimoLembreteEm, null)
  assert.equal(semLembrete?.alertaWhatsapp, true)
  assert.equal(classificarAcompanhamento(comLembrete!, AGORA), 'mais_de_3_dias')
  assert.equal(classificarAcompanhamento(semLembrete!, AGORA), 'mais_de_3_dias')

  const semContato = itens.find((item) => item.condominioNome.includes('Sem Contato'))
  assert.equal(semContato?.primeiroEnvioEm, null)
  assert.equal(semContato?.alertaWhatsapp, true)
  assert.equal(classificarAcompanhamento(semContato!, AGORA), 'aguardando_envio')

  const envio = montarListaAcompanhamento({ itens, agora: AGORA, situacao: 'aguardando_envio', busca: '' })
  assert.deepEqual(envio.linhas.map((linha) => linha.condominioNome), [
    'Condomínio Fictício Aurora',
    'Condomínio Fictício Sem Contato',
  ])
  const busca = montarListaAcompanhamento({ itens, agora: AGORA, situacao: 'aguardando_envio', busca: 'Sem Contato' })
  assert.equal(busca.linhas.length, 1)
  assert.equal(busca.contagens.aguardando_envio, 2)

  const confirmacao = montarListaAcompanhamento({ itens, agora: AGORA, situacao: 'aguardando_confirmacao', busca: '' })
  assert.deepEqual(confirmacao.linhas.map((linha) => linha.condominioNome), [
    'Condomínio Fictício 72 horas exatas',
    'Condomínio Fictício Quase 72 horas',
  ])

  const atraso = montarListaAcompanhamento({ itens, agora: AGORA, situacao: 'mais_de_3_dias', busca: '' })
  assert.deepEqual(atraso.linhas.map((linha) => linha.condominioNome), [
    'Condomínio Fictício Com Lembrete',
    'Condomínio Fictício Sem Lembrete',
  ])

  const confirmados = montarListaAcompanhamento({ itens, agora: AGORA, situacao: 'confirmados', busca: '' })
  assert.deepEqual(confirmados.linhas.map((linha) => linha.condominioNome), [
    'Condomínio Fictício Confirmação Recente',
    'Condomínio Fictício Confirmação Antiga',
  ])
  assert.notEqual(confirmados.linhas[0].confirmadoEm?.slice(0, 10), confirmados.linhas[1].confirmadoEm?.slice(0, 10))
})

test('a prévia fica fechada fora do desenvolvimento local', () => {
  assert.equal(previaLocalPermitida({ nodeEnv: 'development', supabaseUrl: 'http://127.0.0.1:54321' }), true)
  assert.equal(previaLocalPermitida({ nodeEnv: 'development', supabaseUrl: 'http://localhost:54321' }), true)
  assert.equal(previaLocalPermitida({ nodeEnv: 'production', supabaseUrl: 'http://127.0.0.1:54321' }), false)
  assert.equal(previaLocalPermitida({ nodeEnv: 'development', supabaseUrl: 'https://projeto.supabase.co' }), false)
  assert.equal(previaLocalPermitida({ nodeEnv: 'development', supabaseUrl: undefined }), false)
})
