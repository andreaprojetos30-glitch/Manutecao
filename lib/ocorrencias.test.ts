import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { rotuloSituacaoOcorrencia, validarRetorno, validarTratamento } from './ocorrencias.ts'

const prestador = '00000000-0000-4000-8000-000000000030'

test('tratamento aceita qualquer situação e exige texto', () => {
  assert.equal(rotuloSituacaoOcorrencia('em_analise'), 'Em análise')
  assert.equal(rotuloSituacaoOcorrencia('aguardando_aprovacao'), 'Aguardando aprovação do condomínio')
  assert.equal(rotuloSituacaoOcorrencia('retorno_programado'), 'Retorno técnico programado')
  assert.equal(rotuloSituacaoOcorrencia('codigo-interno'), 'Acompanhamento')
  assert.equal(validarTratamento('em_analise', '  Ver a correia  ').erro, null)
  assert.equal(validarTratamento('aguardando_execucao', 'Agendar a troca').dados?.situacao, 'aguardando_execucao')
  assert.equal(validarTratamento('resolvida', '   ').erro, 'Informe a solução adotada.')
  assert.equal(validarTratamento('aberta', ' ').erro, 'Informe a observação ou a providência.')
  assert.equal(validarTratamento('fila', 'Texto').erro, 'Escolha a situação da ocorrência.')
  assert.equal(validarRetorno('2026-12-02', prestador).erro, null)
  assert.equal(validarRetorno('', prestador).erro, 'Informe a data.')
  assert.equal(validarRetorno('2026-12-02', '').erro, 'Selecione o prestador.')
})

test('tratamento fica na manutenção e não abre fila nem relatório', () => {
  const detalhe = fs.readFileSync('app/adm/manutencoes/[id]/page.tsx', 'utf8')
  const tratamento = fs.readFileSync('app/adm/manutencoes/TratamentoOcorrencia.tsx', 'utf8')
  const prestador = fs.readFileSync('app/prestador/acoes.ts', 'utf8')
  assert.equal(detalhe.includes('Ocorrências identificadas'), true)
  assert.equal(detalhe.includes('Equipamentos verificados'), true)
  assert.equal(tratamento.includes('Tratamento administrativo'), true)
  assert.equal(tratamento.includes('Histórico das providências'), true)
  assert.equal(tratamento.includes('Programar retorno'), true)
  assert.equal(tratamento.includes('não altera o status da visita'), true)
  assert.equal(tratamento.includes('não conta como visita preventiva'), true)
  assert.equal(detalhe.includes('/adm/ocorrencias'), false)
  assert.equal(prestador.includes('registrar_tratamento_ocorrencia'), false)
  assert.equal(prestador.includes('programar_retorno_ocorrencia'), false)
})
