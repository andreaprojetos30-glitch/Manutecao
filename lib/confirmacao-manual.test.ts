import assert from 'node:assert/strict'
import test from 'node:test'
import { caminhoComprovante } from './comprovante-armazenamento.ts'
import {
  caminhoDocumentoConfirmacao,
  codigoDocumentoValido,
  documentoConfirmacao,
  garantiaDocumento,
  justificativaConfirmacao,
  resumoConfirmacaoManual,
  ROTULO_SEM_VALIDADE,
} from './confirmacao-manual.ts'

const ID = '00000000-0000-4000-8000-0000000000aa'

test('justificativa da confirmação manual é obrigatória e cabe em 400 caracteres', () => {
  assert.equal(justificativaConfirmacao('  ').erro, 'Informe a justificativa da confirmação.')
  assert.equal(justificativaConfirmacao('a'.repeat(401)).erro, 'A justificativa da confirmação precisa caber em 400 caracteres.')
  assert.equal(justificativaConfirmacao('  O síndico confirmou por telefone.  ').texto, 'O síndico confirmou por telefone.')
})

test('código e caminho do documento não ocupam o comprovante de execução', () => {
  assert.equal(codigoDocumentoValido('CM-2026-000001'), true)
  assert.equal(codigoDocumentoValido('CM-2026-000001-D'), true)
  assert.equal(codigoDocumentoValido('CM-2026-1'), false)
  const caminho = caminhoDocumentoConfirmacao(ID, 'CM-2026-000001')
  const declaracao = caminhoDocumentoConfirmacao(ID, 'CM-2026-000001-D')
  assert.equal(caminho, `${ID}/confirmacoes/CM-2026-000001.pdf`)
  assert.equal(declaracao, `${ID}/confirmacoes/CM-2026-000001-D.pdf`)
  assert.notEqual(caminho, caminhoComprovante(ID))
  assert.equal(caminhoDocumentoConfirmacao(ID, '../comprovante.pdf'), null)
})

test('resumo e documento recusam segredo e distinguem link, manual e declaração', () => {
  assert.equal(resumoConfirmacaoManual({ pode_registrar: true, origem_vigente: null, historico: [], token: 'x' }), null)
  const resumo = resumoConfirmacaoManual({
    pode_registrar: false,
    origem_vigente: 'manual',
    vigente_em: '2026-11-01T18:00:00.000Z',
    vigente_responsavel: 'Ana ADM',
    vigente_papel: null,
    vigente_justificativa: 'Confirmou por telefone.',
    vigente_registro_id: ID,
    vigente_destinatario: 'Síndico Manual',
    vigente_codigo: 'CM-2026-000007',
    historico: [{
      registro_id: ID,
      registrado_em: '2026-11-01T18:00:00.000Z',
      responsavel: 'Ana ADM',
      justificativa: 'Confirmou por telefone.',
      destinatario_nome: 'Síndico Manual',
      destinatario_papel: 'sindico',
      codigo: 'CM-2026-000007',
      correcao_em: '2026-11-01T19:00:00.000Z',
      correcao_responsavel: 'Ana ADM',
      correcao_justificativa: 'Manutenção trocada.',
      declaracao_codigo: 'CM-2026-000007-D',
    }],
  })
  assert.equal(resumo?.origemVigente, 'manual')
  assert.equal(resumo?.historico[0]?.declaracaoCodigo, 'CM-2026-000007-D')
  assert.equal(resumo?.historico[0]?.correcaoEm !== null, true)
  assert.equal(ROTULO_SEM_VALIDADE, 'Sem validade atual')

  const documento = documentoConfirmacao({
    codigo: 'CM-2026-000007',
    caminho: `${ID}/confirmacoes/CM-2026-000007.pdf`,
    classe: 'confirmacao',
    origem: 'manual',
    condominio: 'Condomínio Açores',
    tipo: 'avulsa',
    numero_visita: null,
    quantidade_visitas: null,
    data_manutencao: '2026-11-01',
    ocorrido_em: '2026-11-01T18:00:00.000Z',
    responsavel: 'Ana ADM',
    papel: null,
    destinatario_nome: 'Síndico Manual',
    destinatario_papel: 'sindico',
    justificativa: 'Confirmou por telefone.',
    codigo_origem: null,
  })
  assert.equal(documento?.tituloManutencao, 'MANUTENÇÃO AVULSA')
  assert.equal(documento?.dataManutencao, '01/11/2026')
  assert.equal(garantiaDocumento({
    codigo: 'CM-2026-000007',
    caminho: `${ID}/confirmacoes/CM-2026-000007.pdf`,
    declaracao_codigo: 'CM-2026-000008',
    declaracao_caminho: null,
  }), null)
})
