import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  acaoVisita,
  mensagemExecucao,
  rotuloResultado,
  textoFaltam,
  textoProgresso,
  validarFoto,
  validarOcorrencia,
  visitaEditavel,
} from './execucao.ts'

test('progresso, falta e resultado usam texto, não só cor', () => {
  assert.equal(textoProgresso(4, 6), '4 de 6 equipamentos verificados')
  assert.equal(textoProgresso(0, 1), '0 de 1 equipamento verificado')
  assert.equal(textoProgresso(0, 0), 'Nenhum equipamento nesta visita.')
  assert.equal(textoFaltam(2), 'Ainda faltam 2 equipamentos para finalizar.')
  assert.equal(textoFaltam(1), 'Ainda falta 1 equipamento para finalizar.')
  assert.equal(textoFaltam(0), null)
  assert.equal(rotuloResultado('pendente', null), 'Pendente')
  assert.equal(rotuloResultado('ok', null), 'OK')
  assert.equal(rotuloResultado('ocorrencia', true), 'Ocorrência · Resolvida no local')
  assert.equal(rotuloResultado('ocorrencia', false), 'Ocorrência · Não resolvida no local')
  assert.equal(acaoVisita('programada'), 'Iniciar manutenção')
  assert.equal(acaoVisita('em_execucao'), 'Continuar manutenção')
  assert.equal(acaoVisita('realizada'), 'Consultar')
  assert.equal(visitaEditavel('programada'), true)
  assert.equal(visitaEditavel('realizada'), false)
  assert.equal(visitaEditavel('cancelada'), false)
})

test('ocorrência exige descrição, resolução e imagem', () => {
  assert.equal(validarOcorrencia('  ', 'sim').erro, 'Descreva o problema.')
  assert.equal(validarOcorrencia('Correia solta', '').erro, 'Informe se foi resolvida no local.')
  assert.equal(validarOcorrencia('Correia solta', 'nao').resolvida, false)
  assert.equal(validarFoto(null, false), 'Selecione uma foto.')
  assert.equal(validarFoto(null, true), null)
  assert.equal(validarFoto({ size: 10, type: 'image/jpeg', name: 'foto.jpg' }, false), null)
  assert.equal(validarFoto({ size: 10, type: '', name: 'foto.heic' }, false), null)
  assert.equal(validarFoto({ size: 10, type: 'image/svg+xml', name: 'foto.svg' }, false), 'A foto precisa ser uma imagem.')
  assert.match(validarFoto({ size: 9 * 1024 * 1024, type: 'image/jpeg', name: 'foto.jpg' }, false) ?? '', /tamanho/)
  assert.match(mensagemExecucao('Visita não atribuída'), /não atribuída/)
  assert.match(mensagemExecucao('A foto não foi enviada'), /não foi enviada/)
})

test('área do prestador lista todas as visitas e não trata ocorrência', () => {
  const lista = fs.readFileSync('app/prestador/page.tsx', 'utf8')
  const visita = fs.readFileSync('app/prestador/manutencoes/[id]/page.tsx', 'utf8')
  const form = fs.readFileSync('app/prestador/FormOcorrencia.tsx', 'utf8')
  const acoes = fs.readFileSync('app/prestador/acoes.ts', 'utf8')
  assert.equal(lista.includes('Minhas Manutenções'), true)
  assert.equal(lista.includes('slice(0, 3)'), false)
  assert.equal(lista.includes('Histórico'), true)
  assert.equal(visita.includes('Finalizar manutenção'), true)
  assert.equal(visita.includes('Confirmo a finalização desta manutenção'), true)
  assert.equal(visita.includes('>OK<'), true)
  assert.equal(visita.includes('Ocorrência'), true)
  assert.equal(form.includes('Resolvida no local?'), true)
  assert.equal(form.includes('capture="environment"'), true)
  assert.equal(form.includes('Cancelar'), true)
  assert.equal(form.includes('classificacao'), false)
  assert.equal(acoes.includes('registrar_ocorrencia'), true)
  assert.equal(acoes.includes('necessita_orcamento'), false)
})
