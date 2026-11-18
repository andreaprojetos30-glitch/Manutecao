import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { TAMANHO_MAXIMO_FOTO } from './execucao.ts'
import {
  avaliarInfoFoto,
  caminhoFotoPermitido,
  enviarFotoDireta,
  ERRO_FOTO_NAO_ENVIADA,
  infoFotoDe,
  montarCaminhoFoto,
  tipoConteudoFoto,
} from './fotos.ts'

const manutencao = '00000000-0000-4000-8000-000000000066'
const item = '00000000-0000-4000-8000-000000000076'
const outroItem = '00000000-0000-4000-8000-000000000077'
const marco = 1763480000000

test('caminho da foto fica preso à manutenção e ao equipamento', () => {
  const caminho = montarCaminhoFoto(manutencao, item, 'IMG.JPEG', marco)
  assert.equal(caminho, `${manutencao}/${item}-${marco}.jpg`)
  assert.equal(caminhoFotoPermitido(manutencao, item, caminho ?? ''), true)
  assert.equal(caminhoFotoPermitido(manutencao.toUpperCase(), item, caminho ?? ''), true)
  assert.equal(caminhoFotoPermitido(manutencao, outroItem, caminho ?? ''), false)
  assert.equal(caminhoFotoPermitido(outroItem, item, caminho ?? ''), false)
  assert.equal(caminhoFotoPermitido(manutencao, item, `${manutencao}/${item}-${marco}.svg`), false)
  assert.equal(caminhoFotoPermitido(manutencao, item, `${manutencao}/${item}-${marco}.jpg/extra`), false)
  assert.equal(caminhoFotoPermitido(manutencao, item, `../${manutencao}/${item}-${marco}.jpg`), false)
  assert.equal(caminhoFotoPermitido(manutencao, item, `${manutencao}/../${item}-${marco}.jpg`), false)
  assert.equal(montarCaminhoFoto('visita', item, 'foto.jpg', marco), null)
  assert.equal(tipoConteudoFoto('foto.heic', ''), 'image/heic')
  assert.equal(tipoConteudoFoto('foto.svg', 'image/svg+xml'), '')
  assert.equal(tipoConteudoFoto('foto.jpg', 'image/jpeg'), 'image/jpeg')
})

test('foto armazenada só vale com até 8 MB e tipo de imagem', () => {
  assert.equal(TAMANHO_MAXIMO_FOTO, 8 * 1024 * 1024)
  assert.deepEqual(avaliarInfoFoto({ size: TAMANHO_MAXIMO_FOTO, contentType: 'image/jpeg' }), {
    ok: true,
    erro: '',
    apagar: false,
  })
  const grande = avaliarInfoFoto({ size: TAMANHO_MAXIMO_FOTO + 1, contentType: 'image/jpeg' })
  assert.equal(grande.ok, false)
  assert.equal(grande.apagar, true)
  assert.match(grande.erro, /tamanho/)
  const svg = avaliarInfoFoto({ size: 20, contentType: 'image/svg+xml' })
  assert.equal(svg.ok, false)
  assert.equal(svg.apagar, true)
  const ausente = avaliarInfoFoto(null)
  assert.equal(ausente.ok, false)
  assert.equal(ausente.apagar, false)
  assert.equal(ausente.erro, ERRO_FOTO_NAO_ENVIADA)
  assert.equal(infoFotoDe({ size: 10, contentType: 'image/png' })?.size, 10)
  assert.equal(infoFotoDe({ size: 10, content_type: 'image/heic' })?.contentType, 'image/heic')
  assert.equal(infoFotoDe({ size: Number.NaN, contentType: 'image/png' }), null)
  assert.equal(infoFotoDe({ size: 10, contentType: '   ' }), null)
  assert.equal(infoFotoDe(null), null)
})

test('envio direto usa o token e o caminho, sem trocar o destino', async () => {
  const chamadas: Array<{ caminho: string; token: string; tipo: string; upsert: false }> = []
  const destino = {
    async uploadToSignedUrl(caminho: string, token: string, arquivo: Blob, opcoes: { contentType: string; upsert: false }) {
      chamadas.push({ caminho, token, tipo: opcoes.contentType, upsert: opcoes.upsert })
      assert.equal(arquivo.size, 4)
      assert.equal(arquivo.type, 'image/jpeg')
      return { error: null }
    },
  }
  const envio = { caminho: `${manutencao}/${item}-${marco}.jpg`, token: 'token-curto' }
  assert.equal(await enviarFotoDireta(destino, envio, new Blob(['foto']), 'image/jpeg'), true)
  assert.deepEqual(chamadas, [{ caminho: envio.caminho, token: 'token-curto', tipo: 'image/jpeg', upsert: false }])
  assert.equal(await enviarFotoDireta(destino, { caminho: envio.caminho, token: '' }, new Blob(['foto']), 'image/jpeg'), false)
  assert.equal(chamadas.length, 1)
  const falha = {
    async uploadToSignedUrl() {
      return { error: { message: 'falhou' } }
    },
  }
  assert.equal(await enviarFotoDireta(falha, envio, new Blob(['foto']), 'image/jpeg'), false)
})

test('o navegador não manda a foto pela Server Action nem recebe a chave de serviço', () => {
  const acoes = fs.readFileSync('app/prestador/acoes.ts', 'utf8')
  const form = fs.readFileSync('app/prestador/FormOcorrencia.tsx', 'utf8')
  const fotos = fs.readFileSync('lib/fotos.ts', 'utf8')
  const cliente = fs.readFileSync('lib/supabase/client.ts', 'utf8')
  const config = fs.readFileSync('next.config.mjs', 'utf8')
  const bucket = fs.readFileSync('supabase/migrations/20261010130000_storage_fotos.sql', 'utf8')
  const registro = acoes.slice(acoes.indexOf('export async function registrarOcorrencia'))
  assert.equal(acoes.includes('createSignedUploadUrl'), true)
  assert.equal(acoes.includes('.info('), true)
  assert.equal(acoes.includes("upsert: false"), true)
  assert.ok(registro.indexOf('fotoConfirmada') < registro.indexOf("rpc('registrar_ocorrencia'"))
  assert.ok(registro.includes('if (!confirmada.ok)'))
  assert.equal(acoes.includes('registrar_ocorrencia'), true)
  const formularioSemCaminho = form.replaceAll('name="foto_enviada"', '').replaceAll('name="foto_atual"', '')
  assert.equal(acoes.includes('arrayBuffer'), false)
  assert.equal(acoes.includes("get('foto')"), false)
  assert.equal(acoes.includes('.upload('), false)
  assert.equal(formularioSemCaminho.includes('name="foto"'), false)
  assert.equal(acoes.includes('SUPABASE_SERVICE_ROLE_KEY'), false)
  assert.equal(form.includes('name="foto_enviada"'), true)
  assert.equal(form.includes('autorizarEnvioFoto'), true)
  assert.equal(form.includes('enviarFotoDireta'), true)
  assert.equal(form.includes('capture="environment"'), true)
  assert.equal(form.includes('Salvar ocorrência'), true)
  assert.equal(form.includes('Cancelar'), true)
  assert.equal(form.includes('SUPABASE_SERVICE_ROLE_KEY'), false)
  assert.equal(fotos.includes('SUPABASE_SERVICE_ROLE_KEY'), false)
  assert.equal(cliente.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'), true)
  assert.equal(cliente.includes('SUPABASE_SERVICE_ROLE_KEY'), false)
  assert.equal(config.includes('bodySizeLimit'), false)
  assert.match(bucket, /'fotos', 'fotos', false/)
})
