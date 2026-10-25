import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CAMPOS_COMPROVANTE,
  IDENTIFICACAO_ELEVA,
  comprovanteExigeAutorizacao,
  prepararComprovante,
  textoComprovante,
  tituloComprovante,
  type VisitaParaComprovante,
} from './comprovante.ts'

const SEGREDOS = [
  'SEGREDO-DESCRICAO',
  'SEGREDO-FOTO',
  'SEGREDO-PROVIDENCIA',
  'SEGREDO-SOLUCAO',
  'SEGREDO-SINDICO',
  'SEGREDO-OBS',
  'SEGREDO-CLASSIFICACAO',
]

function visita(parcial: Partial<VisitaParaComprovante> = {}): VisitaParaComprovante {
  return {
    tipo: 'preventiva',
    numeroVisita: 24,
    quantidadeVisitas: 36,
    registroAnterior: false,
    status: 'realizada',
    condominio: 'Manoá Residencie',
    dataEfetiva: '2026-11-01',
    prestador: 'Geovane',
    equipamentos: [{ nome: 'Esteira' }, { nome: 'Bike' }],
    ...parcial,
  }
}

test('títulos identificam a visita contratual e a avulsa', () => {
  assert.equal(tituloComprovante('preventiva', 24, 36), 'VISITA 24/36')
  assert.equal(tituloComprovante('preventiva', 1, 36), 'VISITA 1/36')
  assert.equal(tituloComprovante('preventiva', 36, 36), 'VISITA 36/36')
  assert.equal(tituloComprovante('avulsa', null, null), 'MANUTENÇÃO AVULSA')
  assert.equal(tituloComprovante('avulsa', 1, 36), 'MANUTENÇÃO AVULSA')
  assert.equal(tituloComprovante('preventiva', null, 36), null)
  assert.equal(tituloComprovante('preventiva', 37, 36), null)
  assert.equal(tituloComprovante('preventiva', 0, 36), null)
  assert.equal(tituloComprovante('corretiva', null, null), null)
  assert.equal(tituloComprovante('corretiva_complementar', 2, 36), null)
})

test('comprovante guarda só a lista fechada', () => {
  const preparado = prepararComprovante(visita())
  assert.equal(preparado.erro, null)
  assert.ok(preparado.comprovante)
  assert.deepEqual(Object.keys(preparado.comprovante), [...CAMPOS_COMPROVANTE])
  assert.equal(preparado.comprovante.identificacao, IDENTIFICACAO_ELEVA)
  assert.equal(preparado.comprovante.titulo, 'VISITA 24/36')
  assert.equal(preparado.comprovante.condominio, 'Manoá Residencie')
  assert.equal(preparado.comprovante.dataEfetiva, '01/11/2026')
  assert.equal(preparado.comprovante.prestador, 'Geovane')
  assert.deepEqual(preparado.comprovante.equipamentos, ['Esteira', 'Bike'])
  assert.equal(preparado.comprovante.equipamentos.every((item) => typeof item === 'string'), true)

  const avulsa = prepararComprovante(visita({
    tipo: 'avulsa',
    numeroVisita: 4,
    quantidadeVisitas: 36,
    status: 'aguardando_administracao',
    dataEfetiva: '2026-10-14T18:30:00.000Z',
    equipamentos: [{ nome: '  Pulley  ' }, { nome: '   ' }],
  }))
  assert.equal(avulsa.erro, null)
  assert.equal(avulsa.comprovante?.titulo, 'MANUTENÇÃO AVULSA')
  assert.deepEqual(avulsa.comprovante?.equipamentos, ['Pulley'])
  assert.equal(avulsa.comprovante?.dataEfetiva, '14/10/2026')
})

test('ocorrência não entra no texto do comprovante, mesmo resolvida no local', () => {
  const entrada = {
    ...visita(),
    equipamentos: [
      {
        nome: 'Esteira',
        resultado: 'ocorrencia',
        resolvidaNoLocal: true,
        descricao: 'SEGREDO-DESCRICAO',
        foto: 'SEGREDO-FOTO',
        providencia: 'SEGREDO-PROVIDENCIA',
        solucao: 'SEGREDO-SOLUCAO',
        observacao: 'SEGREDO-OBS',
        textoParaSindico: 'SEGREDO-SINDICO',
        classificacao: 'SEGREDO-CLASSIFICACAO',
      },
      { nome: 'Bike', resultado: 'ok' },
    ],
    ocorrencias: [
      {
        resolvidaNoLocal: true,
        situacao: 'resolvida',
        descricao: 'SEGREDO-DESCRICAO',
        fotoUrl: 'SEGREDO-FOTO',
        providencia: 'SEGREDO-PROVIDENCIA',
        solucao: 'SEGREDO-SOLUCAO',
      },
    ],
  }
  const preparado = prepararComprovante(entrada)
  assert.equal(preparado.erro, null)
  assert.ok(preparado.comprovante)
  const texto = textoComprovante(preparado.comprovante)
  const serializado = JSON.stringify(preparado.comprovante)
  for (const segredo of SEGREDOS) {
    assert.equal(texto.includes(segredo), false)
    assert.equal(serializado.includes(segredo), false)
  }
  assert.equal(texto.includes('ocorrencia'), false)
  assert.equal(texto.includes('resolvida'), false)
  assert.equal(serializado.includes('descricao'), false)
  assert.equal(serializado.includes('foto'), false)
  assert.equal(serializado.includes('providencia'), false)
  assert.equal(serializado.includes('solucao'), false)
  assert.deepEqual(preparado.comprovante.equipamentos, ['Esteira', 'Bike'])
})

test('orçamento pendente exige autorização e ocorrência comum não exige', () => {
  assert.equal(comprovanteExigeAutorizacao([]), false)
  assert.equal(comprovanteExigeAutorizacao([
    { necessitaOrcamento: false, situacao: 'resolvida' },
  ]), false)
  assert.equal(comprovanteExigeAutorizacao([
    { necessitaOrcamento: false, situacao: 'aberta' },
    { necessitaOrcamento: false, situacao: 'em_analise' },
  ]), false)
  assert.equal(comprovanteExigeAutorizacao([
    { necessitaOrcamento: true, situacao: 'resolvida' },
  ]), true)
  assert.equal(comprovanteExigeAutorizacao([
    { necessitaOrcamento: false, situacao: 'aguardando_orcamento' },
  ]), true)
  assert.equal(comprovanteExigeAutorizacao([
    { necessitaOrcamento: false, situacao: 'resolvida' },
    { necessitaOrcamento: true, situacao: 'aberta' },
  ]), true)
})

test('comprovante recusa registro anterior, cancelada e dados incompletos', () => {
  assert.equal(prepararComprovante(visita({ registroAnterior: true })).erro, 'Registro anterior não gera comprovante.')
  assert.equal(prepararComprovante(visita({ status: 'cancelada' })).erro, 'Manutenção cancelada não gera comprovante.')
  assert.equal(prepararComprovante(visita({ tipo: 'corretiva', numeroVisita: null, quantidadeVisitas: null })).erro, 'Somente a visita contratual ou a manutenção avulsa gera comprovante.')
  assert.equal(prepararComprovante(visita({ condominio: '   ' })).erro, 'Informe o condomínio.')
  assert.equal(prepararComprovante(visita({ dataEfetiva: null })).erro, 'Informe a data efetiva.')
  assert.equal(prepararComprovante(visita({ dataEfetiva: '2026-02-31' })).erro, 'Informe a data efetiva.')
  assert.equal(prepararComprovante(visita({ prestador: '  ' })).erro, 'Informe o prestador.')
  assert.equal(prepararComprovante(visita({ equipamentos: [{ nome: '  ' }] })).erro, 'Informe os equipamentos atendidos.')
})
