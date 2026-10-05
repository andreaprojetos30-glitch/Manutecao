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
  fimContratoCalculado,
  preverProgramacao,
  rotuloContrato,
  rotuloVisita,
  situacaoContrato,
  textoContratos,
  textoVisitas,
  validarContrato,
  validarEquipamentoContrato,
} from './contratos.ts'

const contratoBase = {
  condominioId: '00000000-0000-4000-8000-000000000010',
  dataInicioContrato: '2026-01-01',
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

test('fim do contrato é a data da última visita mensal', () => {
  assert.equal(fimContratoCalculado('2026-10-14', '12'), '2027-09-14')
  assert.equal(fimContratoCalculado('2026-10-14', '1'), '2026-10-14')
  assert.equal(fimContratoCalculado('2026-01-31', '2'), '2026-02-28')
  assert.equal(fimContratoCalculado('2026-01-31', '3'), '2026-03-31')
  assert.equal(fimContratoCalculado('2024-01-31', '2'), '2024-02-29')
  assert.equal(fimContratoCalculado('2026-01-31', ''), null)
  assert.equal(fimContratoCalculado('2026-01-31', '0'), null)
  const datas = preverProgramacao('2026-01-31', 3, [])
  assert.deepEqual(datas.map((linha) => linha.data), ['2026-01-31', '2026-02-28', '2026-03-31'])
  assert.equal(datas.at(-1)?.data, fimContratoCalculado('2026-01-31', '3'))
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
  assert.match(orientacaoContrato('equipamentos', 0, false).texto, /identificação do equipamento/)
  assert.equal(orientacaoContrato('contrato', 0, false).destino, 'equipamentos')
  assert.equal(orientacaoContrato('equipamentos', 2, false).destino, 'conferir')
  assert.match(orientacaoContrato('conferir', 2, false).texto, /gere a programação/)
  assert.equal(orientacaoContrato('contrato', 2, true).destino, 'programacao')
  assert.equal(caminhoEtapa('abc', 'equipamentos'), '/adm/contratos/abc/equipamentos')
})

test('contrato exige condomínio e não aceita tipo avulso', () => {
  assert.equal(validarContrato({ ...contratoBase, condominioId: '' }).erro, 'Selecione o condomínio.')
  assert.equal(validarContrato({ ...contratoBase, status: 'avulso' }).erro, 'Selecione a situação do contrato.')
  const doze = validarContrato({
    ...contratoBase,
    dataInicioContrato: '2028-01-01',
    dataInicioManutencao: '2026-10-14',
    quantidadeVisitas: '12',
  })
  assert.equal(doze.erro, null)
  assert.equal(doze.dados?.dataFimContrato, '2027-09-14')
  const uma = validarContrato({ ...contratoBase, dataInicioManutencao: '2026-10-14', quantidadeVisitas: '1' })
  assert.equal(uma.dados?.dataFimContrato, '2026-10-14')
  assert.equal(uma.dados?.dataInicioContrato, '2026-01-01')
  const valido = validarContrato({ ...contratoBase, quantidadeVisitas: '15', prestadorId: '00000000-0000-4000-8000-000000000030' })
  assert.equal(valido.dados?.quantidadeVisitas, 15)
  assert.equal(valido.dados?.dataFimContrato, '2027-03-31')
  assert.equal(valido.dados?.prestadorId, '00000000-0000-4000-8000-000000000030')
  assert.match(mensagemContrato('new row violates check constraint "contratos_fim_calculado"'), /calculado pela programação/)
  assert.equal(validarEquipamentoContrato({ matrizId: contratoBase.condominioId, nome: ' Esteira 01 ', entrada: '2026-01-31', saida: '' }).dados?.nome, 'Esteira 01')
  assert.match(validarEquipamentoContrato({ matrizId: contratoBase.condominioId, nome: 'Esteira 01', entrada: '2026-03-01', saida: '2026-02-01' }).erro ?? '', /saída/)
  assert.match(mensagemContrato('A programação deste contrato já foi gerada'), /já foi gerada/)
  assert.match(mensagemContrato('Could not find the function public.gerar_programacao_contrato'), /atualização do banco/)
})

test('formulário do contrato não pede número nem oferece avulso', () => {
  const formulario = fs.readFileSync('app/adm/contratos/FormContrato.tsx', 'utf8')
  const acoes = fs.readFileSync('app/adm/contratos/acoes.ts', 'utf8')
  const conferir = fs.readFileSync('app/adm/contratos/[id]/conferir/page.tsx', 'utf8')
  assert.equal(/name="numero|numero_contrato|avulso|value="12"|value="36"|value="48"/.test(formulario), false)
  assert.equal(formulario.includes('name="data_fim_contrato"'), false)
  assert.equal(formulario.includes('Não altera a quantidade nem as datas das visitas'), false)
  assert.equal(formulario.includes('fimContratoCalculado'), true)
  assert.equal(formulario.includes('disabled readOnly'), true)
  assert.equal(acoes.includes("tipo: 'mensal'"), true)
  assert.equal(acoes.includes('avulso'), false)
  assert.equal(acoes.includes("texto(formData, 'data_fim_contrato')"), false)
  assert.equal(conferir.includes('textoAlertaAgenda'), false)
  assert.equal(conferir.includes('não muda esta lista'), false)
})
