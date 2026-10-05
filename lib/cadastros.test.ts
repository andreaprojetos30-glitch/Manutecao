import assert from 'node:assert/strict'
import test from 'node:test'
import {
  combinaBusca,
  dataHumana,
  periodoSindico,
  filtroOu,
  idValido,
  mensagemBanco,
  situacaoFiltro,
  termoBusca,
  textoSalvo,
  validarCondominio,
  validarEquipamento,
  validarPrestador,
  validarSindicoCorrecao,
  validarSindicoNovo,
} from './cadastros.ts'

const condominioBase = {
  nome: ' Porta do Sol ',
  cep: '13010-000',
  endereco: 'Rua A',
  numero: '',
  complemento: '',
  bairro: 'Centro',
  cidade: 'Campinas',
  estado: 'sp',
  quantidadeUnidades: '',
  observacoes: '',
}

test('busca e situação', () => {
  assert.equal(termoBusca('  Porta, do Sol% '), 'Porta do Sol')
  assert.equal(situacaoFiltro(undefined), 'ativos')
  assert.equal(situacaoFiltro('inativos'), 'inativos')
  assert.equal(situacaoFiltro('qualquer'), 'ativos')
  assert.equal(filtroOu(['nome', 'cidade', 'bairro'], 'Porta do Sol'), 'nome.ilike."%Porta do Sol%",cidade.ilike."%Porta do Sol%",bairro.ilike."%Porta do Sol%"')
  assert.equal(combinaBusca('cambuí', ['Outro Prédio', 'Campinas', 'Cambuí']), true)
  assert.equal(combinaBusca('santos', ['Porta do Sol', 'Campinas', 'Centro']), false)
  assert.equal(combinaBusca('', ['']), true)
})

test('condomínio exige endereço e aceita CEP vazio', () => {
  const ok = validarCondominio(condominioBase)
  assert.equal(ok.erro, null)
  assert.equal(ok.dados?.nome, 'Porta do Sol')
  assert.equal(ok.dados?.cep, '13010-000')
  assert.equal(ok.dados?.estado, 'SP')
  assert.equal(ok.dados?.numero, null)
  assert.equal(validarCondominio({ ...condominioBase, nome: ' ' }).erro, 'Informe o nome do condomínio.')
  assert.equal(validarCondominio({ ...condominioBase, bairro: '' }).erro, 'Informe o bairro.')
  assert.equal(validarCondominio({ ...condominioBase, cidade: '' }).erro, 'Informe a cidade.')
  assert.equal(validarCondominio({ ...condominioBase, cep: '123' }).erro, 'CEP inválido.')
  assert.equal(validarCondominio({ ...condominioBase, cep: '' }).dados?.cep, null)
  assert.equal(validarCondominio({ ...condominioBase, quantidadeUnidades: '-1' }).erro, 'A quantidade de unidades precisa ser um número.')
  assert.equal(validarCondominio({ ...condominioBase, quantidadeUnidades: '40' }).dados?.quantidade_unidades, 40)
})

test('síndico novo não pede fim e a correção preserva o período', () => {
  assert.equal(validarSindicoNovo({ nome: '', whatsapp: '', email: '', dataInicio: '', dataFim: '' }).erro, 'Informe o nome do síndico.')
  assert.equal(validarSindicoNovo({ nome: 'Maria', whatsapp: '', email: '', dataInicio: '', dataFim: '' }).erro, 'Informe a data de início.')
  const novo = validarSindicoNovo({ nome: 'Maria', whatsapp: '11999999999', email: '', dataInicio: '2026-10-05', dataFim: '2020-01-01' })
  assert.equal(novo.erro, null)
  assert.equal(novo.dados?.data_inicio, '2026-10-05')
  assert.equal('data_fim' in (novo.dados ?? {}), false)

  const correcao = validarSindicoCorrecao(
    { nome: 'Síndico Atual', whatsapp: '19911111111', email: 'errado', dataInicio: '2026-01-01', dataFim: '2026-10-04' },
    false,
  )
  assert.equal(correcao.erro, 'E-mail inválido.')
  const ativo = validarSindicoCorrecao(
    { nome: 'Maria', whatsapp: '', email: '', dataInicio: '2026-10-05', dataFim: '2026-10-01' },
    true,
  )
  assert.equal(ativo.dados?.data_fim, null)
  const historico = validarSindicoCorrecao(
    { nome: 'Antigo', whatsapp: '', email: '', dataInicio: '2026-10-05', dataFim: '' },
    false,
  )
  assert.equal(historico.erro, null)
  assert.equal('data_fim' in (historico.dados ?? {}), false)
  assert.equal('data_inicio' in (historico.dados ?? {}), false)
})

test('prestador exige WhatsApp e equipamento exige categoria', () => {
  assert.equal(validarPrestador({ nome: 'Paulo', whatsapp: ' ', email: '', usuarioId: '', observacoes: '' }).erro, 'Informe o WhatsApp.')
  const prestador = validarPrestador({
    nome: 'Paulo',
    whatsapp: ' 19 99999-9999 ',
    email: 'paulo@eleva.test',
    usuarioId: '00000000-0000-4000-8000-000000000002',
    observacoes: '',
  })
  assert.equal(prestador.dados?.whatsapp, '19 99999-9999')
  assert.equal(prestador.dados?.usuario_id, '00000000-0000-4000-8000-000000000002')
  assert.equal(validarPrestador({ nome: 'Paulo', whatsapp: '19999999999', email: '', usuarioId: 'nao-e-id', observacoes: '' }).erro, 'Escolha um acesso válido.')
  assert.equal(validarEquipamento({ nome: 'Esteira', categoria: ' ', fabricante: '', modelo: '', observacoes: '' }).erro, 'Informe a categoria.')
  assert.equal(validarEquipamento({ nome: 'Esteira', categoria: 'Cardio', fabricante: '', modelo: 'X1', observacoes: '' }).dados?.fabricante, null)
})

test('mensagens e datas não exibem identificador técnico', () => {
  assert.equal(idValido('00000000-0000-4000-8000-000000000010'), true)
  assert.equal(idValido('10'), false)
  assert.equal(dataHumana('2026-10-05'), '05/10/2026')
  assert.equal(dataHumana(null), '')
  assert.equal(periodoSindico('2026-01-01', '2026-10-04', false), '01/01/2026 a 04/10/2026')
  assert.equal(periodoSindico('2026-10-05', null, true), 'Desde 05/10/2026')
  assert.equal(mensagemBanco('duplicate key value violates unique constraint "sindicos_um_ativo_por_condominio"'), 'Já existe um síndico ativo neste condomínio.')
  assert.equal(mensagemBanco('new row violates row-level security policy'), 'Sem permissão para esta alteração.')
  assert.match(mensagemBanco('erro com 00000000-0000-4000-8000-000000000010'), /Não foi possível salvar/)
  assert.equal(textoSalvo('sindico'), 'Síndico registrado. O anterior permanece no histórico.')
})
