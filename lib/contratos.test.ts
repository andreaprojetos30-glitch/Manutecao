import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  LIMITE_VISITAS,
  caminhoEtapa,
  dataVisitaMensal,
  equipamentoParticipa,
  mensagemContrato,
  orientacaoContrato,
  periodoEquipamento,
  preverProgramacao,
  rotuloContrato,
  rotuloVisita,
  situacaoContrato,
  textoAlertaAgenda,
  textoContratos,
  textoVisitas,
  validarContrato,
  validarEquipamentoContrato,
} from './contratos.ts'

const contratoBase = {
  condominioId: '00000000-0000-4000-8000-000000000010',
  dataInicioContrato: '2026-01-01',
  dataFimContrato: '',
  dataInicioManutencao: '2026-01-31',
  quantidadeVisitas: '12',
  prestadorId: '',
  status: 'ativo',
}

test('datas mensais usam o último dia válido e voltam ao dia original', () => {
  assert.equal(dataVisitaMensal('2026-01-31', 0), '2026-01-31')
  assert.equal(dataVisitaMensal('2026-01-31', 1), '2026-02-28')
  assert.equal(dataVisitaMensal('2026-01-31', 2), '2026-03-31')
  assert.equal(dataVisitaMensal('2024-01-31', 1), '2024-02-29')
  assert.equal(dataVisitaMensal('2026-03-15', 0), '2026-03-15')
  assert.equal(dataVisitaMensal('2026-01-30', 1), '2026-02-28')
  assert.equal(dataVisitaMensal('2026-01-15', 14), '2027-03-15')
})

test('quantidade de visitas não fica presa em 12, 36 ou 48', () => {
  for (const quantidade of ['1', '7', '12', '15', '36', '48', '60', String(LIMITE_VISITAS)]) {
    const validado = validarContrato({ ...contratoBase, quantidadeVisitas: quantidade })
    assert.equal(validado.erro, null)
    assert.equal(validado.dados?.quantidadeVisitas, Number(quantidade))
    assert.equal(preverProgramacao('2026-01-15', Number(quantidade), []).length, Number(quantidade))
  }
  assert.equal(validarContrato({ ...contratoBase, quantidadeVisitas: '0' }).erro, 'Informe a quantidade de visitas.')
  assert.equal(validarContrato({ ...contratoBase, quantidadeVisitas: '12 meses' }).erro, 'Informe a quantidade de visitas.')
  assert.match(validarContrato({ ...contratoBase, quantidadeVisitas: String(LIMITE_VISITAS + 1) }).erro ?? '', /alta demais/)
})

test('fim do contrato alerta e não corrige a agenda', () => {
  assert.match(textoAlertaAgenda('2026-01-31', '12', '2026-06-30') ?? '', /não foram alteradas/)
  assert.equal(textoAlertaAgenda('2026-01-31', '12', ''), null)
  assert.equal(textoAlertaAgenda('2026-01-15', '2', '2026-02-15'), null)
  assert.match(textoAlertaAgenda('2026-01-15', '2', '2026-02-14') ?? '', /15\/02\/2026/)
  assert.match(textoAlertaAgenda('2026-03-01', '2', '2026-02-01') ?? '', /posterior ao fim/)
  const datas = preverProgramacao('2026-01-31', 3, [])
  assert.deepEqual(datas.map((linha) => linha.data), ['2026-01-31', '2026-02-28', '2026-03-31'])
})

test('equipamento entra na data de entrada e sai no dia seguinte à saída', () => {
  assert.equal(equipamentoParticipa('2026-03-01', null, '2026-03-01'), true)
  assert.equal(equipamentoParticipa('2026-03-01', null, '2026-02-28'), false)
  assert.equal(equipamentoParticipa('2026-01-01', '2026-03-10', '2026-03-10'), true)
  assert.equal(equipamentoParticipa('2026-01-01', '2026-03-10', '2026-03-11'), false)
  const linhas = preverProgramacao('2026-01-31', 3, [
    { nome: 'Esteira 01', entrada: '2026-01-31', saida: null },
    { nome: 'Bike 01', entrada: '2026-01-31', saida: '2026-01-31' },
    { nome: 'Elíptico 01', entrada: '2026-03-31', saida: null },
  ])
  assert.deepEqual(linhas[0].equipamentos, ['Bike 01', 'Esteira 01'])
  assert.deepEqual(linhas[1].equipamentos, ['Esteira 01'])
  assert.deepEqual(linhas[2].equipamentos, ['Elíptico 01', 'Esteira 01'])
})

test('número apresentado é amigável e o fluxo indica o próximo passo', () => {
  assert.equal(rotuloContrato('2026-001'), 'Contrato 2026-001')
  assert.equal(rotuloVisita(5, 15), 'Visita 5/15')
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}/i.test(rotuloContrato('2026-001')), false)
  assert.equal(textoVisitas(1), '1 visita')
  assert.equal(textoContratos(2), '2 contratos')
  assert.equal(periodoEquipamento('2026-01-31', null), 'A partir de 31/01/2026')
  assert.equal(situacaoContrato(undefined), 'ativos')
  assert.equal(situacaoContrato('encerrados'), 'encerrados')

  assert.match(orientacaoContrato('contrato', 0, false, false).texto, /Salve o contrato/)
  assert.equal(orientacaoContrato('contrato', 0, false).destino, 'equipamentos')
  assert.equal(orientacaoContrato('equipamentos', 2, false).destino, 'conferir')
  assert.match(orientacaoContrato('conferir', 2, false).texto, /gere a programação/)
  assert.equal(orientacaoContrato('contrato', 2, true).destino, 'programacao')
  assert.equal(caminhoEtapa('abc', 'equipamentos'), '/adm/contratos/abc/equipamentos')
})

test('contrato exige condomínio e não aceita tipo avulso', () => {
  assert.equal(validarContrato({ ...contratoBase, condominioId: '' }).erro, 'Selecione o condomínio.')
  assert.equal(validarContrato({ ...contratoBase, status: 'avulso' }).erro, 'Selecione a situação do contrato.')
  assert.equal(validarContrato({ ...contratoBase, dataFimContrato: '2025-12-31' }).erro, 'A data de fim do contrato precisa ser igual ou posterior ao início.')
  const valido = validarContrato({ ...contratoBase, quantidadeVisitas: '15', prestadorId: '00000000-0000-4000-8000-000000000030' })
  assert.equal(valido.dados?.quantidadeVisitas, 15)
  assert.equal(valido.dados?.prestadorId, '00000000-0000-4000-8000-000000000030')
  assert.equal(validarEquipamentoContrato({ matrizId: contratoBase.condominioId, nome: ' Esteira 01 ', entrada: '2026-01-31', saida: '' }).dados?.nome, 'Esteira 01')
  assert.match(validarEquipamentoContrato({ matrizId: contratoBase.condominioId, nome: 'Esteira 01', entrada: '2026-03-01', saida: '2026-02-01' }).erro ?? '', /saída/)
  assert.match(mensagemContrato('A programação deste contrato já foi gerada'), /já foi gerada/)
  assert.match(mensagemContrato('Could not find the function public.gerar_programacao_contrato'), /atualização do banco/)
})

test('formulário do contrato não pede número nem oferece avulso', () => {
  const formulario = fs.readFileSync('app/adm/contratos/FormContrato.tsx', 'utf8')
  const acoes = fs.readFileSync('app/adm/contratos/acoes.ts', 'utf8')
  assert.equal(/name="numero|numero_contrato|avulso|value="12"|value="36"|value="48"/.test(formulario), false)
  assert.equal(acoes.includes("tipo: 'mensal'"), true)
  assert.equal(acoes.includes('avulso'), false)
})
