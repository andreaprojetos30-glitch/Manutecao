import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  anoBiblioteca,
  bibliotecaCondominio,
  categoriaBiblioteca,
  consultaDocumentos,
  hrefDocumento,
  type BibliotecaCondominio,
  type DocumentoBiblioteca,
} from './biblioteca-documentos.ts'

const VISITA = 'b3011111-1111-4111-8111-111111111111'
const OUTRA = 'b3021111-1111-4111-8111-111111111111'

function documento(parcial: Partial<DocumentoBiblioteca> & Pick<DocumentoBiblioteca, 'classe' | 'codigo' | 'caminho'>): DocumentoBiblioteca {
  return {
    manutencaoId: VISITA,
    ...parcial,
  }
}

const biblioteca: BibliotecaCondominio = {
  visitas: [
    {
      id: VISITA,
      tipo: 'avulsa',
      numeroVisita: null,
      quantidadeVisitas: null,
      dataProgramada: '2026-12-20',
      dataEfetiva: '2026-12-20',
      status: 'realizada',
      registroAnterior: false,
    },
    {
      id: OUTRA,
      tipo: 'avulsa',
      numeroVisita: null,
      quantidadeVisitas: null,
      dataProgramada: '2027-01-05',
      dataEfetiva: null,
      status: 'programada',
      registroAnterior: false,
    },
  ],
  documentos: [
    documento({ classe: 'comprovante', codigo: null, caminho: `${VISITA}/comprovante.pdf` }),
    documento({ classe: 'confirmacao', codigo: 'CM-2026-000007', caminho: `${VISITA}/confirmacoes/CM-2026-000007.pdf` }),
    documento({ classe: 'declaracao', codigo: 'CM-2026-000007-D', caminho: `${VISITA}/confirmacoes/CM-2026-000007-D.pdf` }),
  ],
}

test('a biblioteca agrupa pela data efetiva e não copia o arquivo', () => {
  const manutencoes = consultaDocumentos(biblioteca, '2026', 'manutencoes')
  assert.equal(manutencoes.grupos.length, 1)
  assert.equal(manutencoes.grupos[0]?.documentos.length, 3)
  assert.deepEqual(manutencoes.grupos[0]?.documentos.map((linha) => linha.rotulo), [
    'Comprovante de execução',
    'Confirmação de recebimento CM-2026-000007',
    'Declaração de correção CM-2026-000007-D',
  ])

  const seguinte = consultaDocumentos(biblioteca, '2027', 'manutencoes')
  assert.equal(seguinte.grupos.length, 0)

  const confirmacoes = consultaDocumentos(biblioteca, '2026', 'confirmacoes')
  const hrefs = confirmacoes.grupos.flatMap((grupo) => grupo.documentos.map((linha) => linha.href))
  assert.deepEqual(hrefs, [
    hrefDocumento(biblioteca.documentos[1]),
    hrefDocumento(biblioteca.documentos[2]),
  ])
  assert.equal(hrefs[0], manutencoes.grupos[0]?.documentos[1]?.href)
  assert.equal(hrefs[0]?.includes('codigo=CM-2026-000007'), true)
  assert.equal(hrefs.some((href) => href.includes('comprovante.pdf')), false)

  const ocorrencias = consultaDocumentos(biblioteca, '2026', 'ocorrencias')
  assert.equal(ocorrencias.grupos.length, 0)
})

test('a leitura recusa segredo e caminho fora do arquivo original', () => {
  assert.equal(bibliotecaCondominio({ visitas: [], documentos: [], token: 'x' }), null)
  const invalido = consultaDocumentos({
    ...biblioteca,
    documentos: [
      documento({ classe: 'confirmacao', codigo: 'CM-2026-000007', caminho: `${VISITA}/comprovante.pdf` }),
    ],
  }, '2026', 'manutencoes')
  assert.equal(invalido.grupos.length, 0)
  assert.equal(anoBiblioteca('1999', new Date('2026-11-10T12:00:00-03:00')), '2026')
  assert.equal(categoriaBiblioteca('painel'), 'manutencoes')
})

test('abrir a biblioteca não chama geração, cópia nem acompanhamento', () => {
  const dados = readFileSync(new URL('./biblioteca-documentos-dados.ts', import.meta.url), 'utf8')
  const pagina = readFileSync(new URL('../app/adm/condominios/[id]/page.tsx', import.meta.url), 'utf8')
  const acessos = readFileSync(new URL('../app/adm/condominios/AcessosCondominio.tsx', import.meta.url), 'utf8')
  const texto = `${dados}\n${pagina}\n${acessos}`
  assert.equal(texto.includes('garantir_documento'), false)
  assert.equal(texto.includes('guardarDocumento'), false)
  assert.equal(texto.includes('ativar_acompanhamento'), false)
  assert.equal(texto.includes('registrar_confirmacao'), false)
  assert.equal(dados.includes('biblioteca_documentos_condominio'), true)
})
