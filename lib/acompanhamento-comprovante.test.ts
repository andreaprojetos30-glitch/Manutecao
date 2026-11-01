import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  PRAZO_CONFIRMACAO_MS,
  classificarAcompanhamento,
  diasAguardando,
  fatosAcompanhamento,
  fichaAcompanhamento,
  mensagemListaAcompanhamento,
  montarListaAcompanhamento,
  textoAlertaWhatsapp,
  type FatoAcompanhamento,
} from './acompanhamento-comprovante.ts'

const AGORA = new Date('2026-11-04T15:00:00.000Z')
const ENVIO = '2026-11-01T15:00:00.000Z'
const ENVIO_EXATO = new Date(AGORA.getTime() - PRAZO_CONFIRMACAO_MS).toISOString()
const ENVIO_ALEM = new Date(AGORA.getTime() - PRAZO_CONFIRMACAO_MS - 1).toISOString()

function fato(parcial: Partial<FatoAcompanhamento> & Pick<FatoAcompanhamento, 'manutencaoId' | 'condominioNome'>): FatoAcompanhamento {
  return {
    condominioId: '00000000-0000-4000-8000-000000000010',
    dataManutencao: '2026-10-01',
    liberadoEm: '2026-10-02T12:00:00.000Z',
    confirmadoEm: null,
    primeiroEnvioEm: null,
    ultimoLembreteEm: null,
    alertaWhatsapp: false,
    ...parcial,
  }
}

test('as quatro situações são exclusivas e o prazo usa o envio confirmado pelo ADM', () => {
  assert.equal(classificarAcompanhamento({ confirmadoEm: null, primeiroEnvioEm: null }, AGORA), 'aguardando_envio')
  assert.equal(classificarAcompanhamento({ confirmadoEm: null, primeiroEnvioEm: ENVIO_EXATO }, AGORA), 'aguardando_confirmacao')
  assert.equal(classificarAcompanhamento({ confirmadoEm: null, primeiroEnvioEm: ENVIO_ALEM }, AGORA), 'mais_de_3_dias')
  assert.equal(classificarAcompanhamento({ confirmadoEm: '2026-11-02T12:00:00.000Z', primeiroEnvioEm: null }, AGORA), 'confirmados')
  assert.equal(classificarAcompanhamento({ confirmadoEm: '2026-11-02T12:00:00.000Z', primeiroEnvioEm: ENVIO_ALEM }, AGORA), 'confirmados')
  assert.equal(diasAguardando(ENVIO_EXATO, AGORA), 3)
  assert.equal(diasAguardando(ENVIO, AGORA), 3)
  assert.equal(diasAguardando(new Date(AGORA.getTime() - 23 * 60 * 60 * 1000).toISOString(), AGORA), 0)

  const comLembrete = classificarAcompanhamento({ confirmadoEm: null, primeiroEnvioEm: ENVIO }, AGORA)
  const semLembrete = classificarAcompanhamento({ confirmadoEm: null, primeiroEnvioEm: ENVIO }, AGORA)
  assert.equal(comLembrete, semLembrete)
  assert.equal(comLembrete, 'aguardando_confirmacao')
})

test('a lista filtra pelo condomínio, ignora o período e ordena cada situação', () => {
  const antigo = fato({
    manutencaoId: '00000000-0000-4000-8000-0000000000a1',
    condominioNome: 'Condomínio Antigo',
    dataManutencao: '2020-01-15',
    liberadoEm: '2026-10-01T10:00:00.000Z',
    primeiroEnvioEm: '2026-10-01T11:00:00.000Z',
  })
  const recente = fato({
    manutencaoId: '00000000-0000-4000-8000-0000000000a2',
    condominioNome: 'Condomínio Recente',
    liberadoEm: '2026-10-20T10:00:00.000Z',
    primeiroEnvioEm: '2026-11-03T15:00:00.000Z',
  })
  const semEnvio = fato({
    manutencaoId: '00000000-0000-4000-8000-0000000000a3',
    condominioNome: 'Condomínio Antigo',
    liberadoEm: '2026-09-01T10:00:00.000Z',
    alertaWhatsapp: true,
  })
  const semEnvioRecente = fato({
    manutencaoId: '00000000-0000-4000-8000-0000000000a6',
    condominioNome: 'Condomínio Sem Envio',
    liberadoEm: '2026-10-15T10:00:00.000Z',
  })
  const confirmada = fato({
    manutencaoId: '00000000-0000-4000-8000-0000000000a4',
    condominioNome: 'Condomínio Confirmado',
    confirmadoEm: '2026-11-01T08:00:00.000Z',
    primeiroEnvioEm: '2026-10-01T08:00:00.000Z',
  })
  const confirmadaNova = fato({
    manutencaoId: '00000000-0000-4000-8000-0000000000a5',
    condominioNome: 'Condomínio Confirmado Novo',
    confirmadoEm: '2026-11-03T08:00:00.000Z',
    primeiroEnvioEm: ENVIO_ALEM,
  })
  const itens = [recente, antigo, confirmadaNova, semEnvioRecente, semEnvio, confirmada]
  const geral = montarListaAcompanhamento({ itens, agora: AGORA, situacao: null, busca: '' })
  assert.deepEqual(geral.contagens, {
    aguardando_envio: 2,
    aguardando_confirmacao: 1,
    mais_de_3_dias: 1,
    confirmados: 2,
  })
  assert.equal(geral.linhas.length, 0)
  assert.equal(geral.contagens.aguardando_envio + geral.contagens.aguardando_confirmacao + geral.contagens.mais_de_3_dias + geral.contagens.confirmados, itens.length)

  const envio = montarListaAcompanhamento({ itens, agora: AGORA, situacao: 'aguardando_envio', busca: '' })
  assert.deepEqual(envio.linhas.map((linha) => linha.manutencaoId), [semEnvio.manutencaoId, semEnvioRecente.manutencaoId])
  const confirmacao = montarListaAcompanhamento({ itens, agora: AGORA, situacao: 'aguardando_confirmacao', busca: '' })
  assert.deepEqual(confirmacao.linhas.map((linha) => linha.manutencaoId), [recente.manutencaoId])
  const atraso = montarListaAcompanhamento({ itens, agora: AGORA, situacao: 'mais_de_3_dias', busca: 'antigo' })
  assert.deepEqual(atraso.linhas.map((linha) => linha.manutencaoId), [antigo.manutencaoId])
  assert.equal(atraso.contagens.mais_de_3_dias, 1)
  const confirmados = montarListaAcompanhamento({ itens, agora: AGORA, situacao: 'confirmados', busca: '' })
  assert.deepEqual(confirmados.linhas.map((linha) => linha.manutencaoId), [confirmadaNova.manutencaoId, confirmada.manutencaoId])

  const vazio = montarListaAcompanhamento({ itens, agora: AGORA, situacao: 'aguardando_envio', busca: 'inexistente' })
  assert.equal(vazio.linhas.length, 0)
  assert.equal(mensagemListaAcompanhamento('aguardando_envio', vazio.busca, 0), 'Nenhuma manutenção encontrada neste acompanhamento.')
  assert.equal(mensagemListaAcompanhamento('aguardando_envio', '', 0), 'Nenhuma manutenção aguardando envio.')
  assert.equal(mensagemListaAcompanhamento('mais_de_3_dias', '', 0), 'Nenhuma manutenção há mais de 3 dias.')
  assert.equal(textoAlertaWhatsapp(false).includes('bloqueado'), true)
  assert.equal(textoAlertaWhatsapp(true).includes('prazo'), true)
  assert.equal(textoAlertaWhatsapp(true).includes('bloqueados'), true)
})

test('o resultado do acompanhamento recusa segredo e indicador zerado antes da ativação', () => {
  assert.deepEqual(fatosAcompanhamento({ ativado: false }), { ativado: false })
  assert.equal(fatosAcompanhamento({ ativado: false, itens: [] }), null)
  assert.equal(fatosAcompanhamento({
    ativado: true,
    itens: [{
      manutencao_id: '00000000-0000-4000-8000-0000000000a1',
      condominio_id: '00000000-0000-4000-8000-000000000010',
      condominio_nome: 'Condomínio',
      data_manutencao: '2026-10-01',
      liberado_em: '2026-10-02T12:00:00.000Z',
      confirmado_em: null,
      primeiro_envio_em: null,
      ultimo_lembrete_em: null,
      alerta_whatsapp: false,
      whatsapp: '5519988887777',
    }],
  }), null)
  assert.deepEqual(fichaAcompanhamento({ ativado: false }), { ativado: false })
  assert.equal(fichaAcompanhamento({ ativado: true, incluida: false, pode_incluir: true })?.ativado, true)
  assert.equal(fs.readFileSync('lib/acompanhamento-comprovante.ts', 'utf8').includes('console.'), false)
  assert.equal(fs.readFileSync('lib/acompanhamento-comprovante-dados.ts', 'utf8').includes('console.error(error)'), false)
  assert.equal(fs.readFileSync('lib/acompanhamento-comprovante-dados.ts', 'utf8').includes('console.log'), false)
})
