import assert from 'node:assert/strict'
import test from 'node:test'
import { prepararComprovante } from './comprovante.ts'
import {
  armazenarComprovante,
  BUCKET_PDFS,
  caminhoComprovante,
} from './comprovante-armazenamento.ts'
import { carregarRecursosComprovante, gerarPdfComprovante } from './comprovante-pdf.ts'

const ID = '00000000-0000-4000-8000-0000000000aa'

function cliente(resultado: { message: string } | null = null) {
  const chamadas: Array<{ bucket: string; caminho: string; conteudo: Uint8Array; opcoes: { contentType: string; upsert: boolean } }> = []
  const proibidos: string[] = []
  return {
    chamadas,
    proibidos,
    from(bucket: typeof BUCKET_PDFS) {
      const api = {
        async upload(caminho: string, conteudo: Uint8Array, opcoes: { contentType: 'application/pdf'; upsert: false }) {
          chamadas.push({ bucket, caminho, conteudo, opcoes })
          return { error: resultado }
        },
      }
      return new Proxy(api, {
        get(alvo, propriedade, receptor) {
          if (propriedade === 'getPublicUrl' || propriedade === 'createSignedUrl') {
            proibidos.push(String(propriedade))
            throw new Error('URL pública não permitida')
          }
          return Reflect.get(alvo, propriedade, receptor)
        },
      })
    },
  }
}

test('caminho do comprovante fica privado e sem URL', () => {
  assert.equal(BUCKET_PDFS, 'pdfs')
  assert.equal(caminhoComprovante(ID), `${ID}/comprovante.pdf`)
  assert.equal(caminhoComprovante(ID.toUpperCase()), `${ID}/comprovante.pdf`)
  assert.equal(caminhoComprovante('../segredo'), null)
  assert.equal(caminhoComprovante('https://exemplo/pdf'), null)
  assert.equal(caminhoComprovante(''), null)
})

test('armazenamento grava no bucket privado e devolve só o caminho', async () => {
  const destino = cliente()
  const pdf = Uint8Array.from(Buffer.from('%PDF-1.7 exemplo'))
  const guardado = await armazenarComprovante(destino, ID, pdf)
  assert.equal(guardado.erro, null)
  assert.equal(guardado.caminho, `${ID}/comprovante.pdf`)
  assert.equal(guardado.caminho?.includes('http'), false)
  assert.equal(destino.chamadas.length, 1)
  assert.equal(destino.chamadas[0].bucket, 'pdfs')
  assert.equal(destino.chamadas[0].opcoes.contentType, 'application/pdf')
  assert.equal(destino.chamadas[0].opcoes.upsert, false)
  assert.equal('public' in destino.chamadas[0].opcoes, false)
  assert.equal(Buffer.from(destino.chamadas[0].conteudo).equals(Buffer.from(pdf)), true)
  assert.deepEqual(destino.proibidos, [])
})

test('falha do storage não vira endereço público', async () => {
  const destino = cliente({ message: 'SEGREDO-STORAGE https://projeto.supabase.co/storage/v1/object/public/pdfs/comprovante.pdf' })
  const guardado = await armazenarComprovante(destino, ID, Uint8Array.from(Buffer.from('%PDF-1.7')))
  assert.equal(guardado.caminho, null)
  assert.equal(guardado.erro, 'O comprovante não foi armazenado.')
  assert.equal(guardado.erro?.includes('SEGREDO'), false)
  assert.equal(guardado.erro?.includes('http'), false)
  assert.deepEqual(destino.proibidos, [])
})

test('id inválido e arquivo incompleto não são enviados', async () => {
  const destino = cliente()
  const semId = await armazenarComprovante(destino, 'visita-real', Uint8Array.from(Buffer.from('%PDF-1.7')))
  const semPdf = await armazenarComprovante(destino, ID, Uint8Array.from(Buffer.from('nao-e-pdf')))
  assert.equal(semId.erro, 'Manutenção não encontrada.')
  assert.equal(semPdf.erro, 'O comprovante não pôde ser gerado.')
  assert.equal(destino.chamadas.length, 0)
})

test('PDF de exemplo fictício seria gravado só como caminho interno', async () => {
  const recursos = await carregarRecursosComprovante()
  const preparado = prepararComprovante({
    tipo: 'avulsa',
    numeroVisita: null,
    quantidadeVisitas: null,
    registroAnterior: false,
    status: 'realizada',
    condominio: 'Condomínio de exemplo',
    dataEfetiva: '2026-03-18',
    prestador: 'Helena Duarte',
    equipamentos: [{ nome: 'Elíptico' }],
  })
  assert.ok(preparado.comprovante)
  const gerado = await gerarPdfComprovante(preparado.comprovante, recursos)
  assert.ok(gerado.pdf)
  const destino = cliente()
  const guardado = await armazenarComprovante(destino, ID, gerado.pdf)
  assert.equal(guardado.erro, null)
  assert.equal(guardado.caminho, `${ID}/comprovante.pdf`)
  assert.equal(Buffer.from(destino.chamadas[0].conteudo).equals(Buffer.from(gerado.pdf)), true)
  assert.equal(String(guardado.caminho).startsWith('http'), false)
})
