import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  dataHoraHumana,
  filtroPrestadorVisita,
  filtroStatusVisita,
  mensagemManutencao,
  periodoVisitas,
  rotuloManutencao,
  textoManutencoes,
  validarAvulsa,
  validarReagendamento,
  visitaAtrasada,
} from './manutencoes.ts'

const matriz = '00000000-0000-4000-8000-000000000040'
const condo = '00000000-0000-4000-8000-000000000010'
const prestador = '00000000-0000-4000-8000-000000000030'

test('rótulos da agenda separam preventiva e avulsa', () => {
  assert.equal(rotuloManutencao('preventiva', 2, 5), 'Visita 2/5')
  assert.equal(rotuloManutencao('avulsa', null, null), 'Manutenção Avulsa')
  assert.equal(rotuloManutencao('avulsa', 1, 5), 'Manutenção Avulsa')
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}/i.test(rotuloManutencao('preventiva', 1, 5)), false)
  assert.equal(textoManutencoes(1), '1 manutenção')
  assert.equal(textoManutencoes(5), '5 manutenções')
  assert.equal(visitaAtrasada('programada', '2026-10-01', '2026-10-09'), true)
  assert.equal(visitaAtrasada('programada', '2026-10-09', '2026-10-09'), false)
  assert.equal(visitaAtrasada('realizada', '2026-10-01', '2026-10-09'), false)
})

test('filtros e reagendamento não aceitam data inválida nem a mesma data', () => {
  assert.equal(filtroStatusVisita(undefined), 'todos')
  assert.equal(filtroStatusVisita('programada'), 'programada')
  assert.equal(filtroStatusVisita('avulsa'), 'todos')
  assert.equal(filtroPrestadorVisita(undefined), 'todos')
  assert.equal(filtroPrestadorVisita('sem'), 'sem')
  assert.equal(filtroPrestadorVisita(prestador), prestador)
  assert.equal(periodoVisitas('2026-10-01', '2026-10-09').erro, null)
  assert.match(periodoVisitas('2026-10-09', '2026-10-01').erro ?? '', /anterior ou igual/)
  assert.equal(validarReagendamento('2026-11-02', '2026-10-14'), null)
  assert.match(validarReagendamento('2026-10-14', '2026-10-14') ?? '', /diferente/)
  assert.match(validarReagendamento('', '2026-10-14') ?? '', /Informe a data/)
  assert.match(mensagemManutencao('Somente o ADM pode reagendar'), /ADM pode reagendar/)
  assert.match(mensagemManutencao('Somente o ADM pode excluir uma manutenção avulsa'), /ADM pode excluir/)
  assert.match(mensagemManutencao('Manutenção preventiva do contrato não pode ser excluída'), /preventiva/)
  assert.match(mensagemManutencao('Manutenção já iniciada não pode ser excluída'), /já iniciada/)
  assert.match(dataHoraHumana('2026-10-09T15:30:00.000Z'), /09\/10\/2026/)
})

test('avulsa exige condomínio, data, prestador e equipamentos da lista', () => {
  const valido = validarAvulsa({ condominioId: condo, data: '2026-11-02', prestadorId: prestador, matrizes: [matriz] })
  assert.equal(valido.erro, null)
  assert.equal(validarAvulsa({ condominioId: '', data: '2026-11-02', prestadorId: prestador, matrizes: [matriz] }).erro, 'Selecione o condomínio.')
  assert.equal(validarAvulsa({ condominioId: condo, data: '', prestadorId: prestador, matrizes: [matriz] }).erro, 'Informe a data.')
  assert.equal(validarAvulsa({ condominioId: condo, data: '2026-11-02', prestadorId: '', matrizes: [matriz] }).erro, 'Selecione o prestador.')
  assert.equal(validarAvulsa({ condominioId: condo, data: '2026-11-02', prestadorId: prestador, matrizes: [] }).erro, 'Selecione ao menos um equipamento.')
  const tela = fs.readFileSync('app/adm/manutencoes/page.tsx', 'utf8')
  const avulsa = fs.readFileSync('app/adm/manutencoes/FormAvulsa.tsx', 'utf8')
  const detalhe = fs.readFileSync('app/adm/manutencoes/[id]/page.tsx', 'utf8')
  const inicio = fs.readFileSync('app/adm/page.tsx', 'utf8')
  assert.equal(tela.includes('Nova manutenção avulsa'), true)
  assert.equal(tela.includes('Atrasada'), true)
  assert.equal(avulsa.includes('Visita '), false)
  assert.equal(avulsa.includes('type="checkbox"'), true)
  assert.equal(detalhe.includes('As demais datas permanecem'), true)
  assert.equal(detalhe.includes('Histórico de reagendamentos'), true)
  assert.equal(detalhe.includes('Excluir manutenção'), true)
  assert.equal(detalhe.includes('Confirmo a exclusão desta manutenção avulsa'), true)
  assert.equal(detalhe.includes("visita.tipo === 'avulsa' && visita.status === 'programada'"), true)
  assert.equal(inicio.includes('/adm/manutencoes'), true)
})
