import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { IDENTIFICACAO_ELEVA } from './comprovante.ts'
import { novoTokenConfirmacao } from './confirmacao-sindico.ts'
import { montarPreparacao } from './whatsapp-comprovante-dados.ts'
import { resumoEnvio } from './whatsapp-comprovante-resumo.ts'
import {
  ORIGEM_LABORATORIO_WHATSAPP,
  avaliarOrigemPublica,
  chaveTokenLink,
  cifrarTokenLink,
  decifrarTokenLink,
  destinoWhatsapp,
  hashSha256Token,
  hashTokenConfirmacao,
  mensagemWhatsapp,
  telefoneWhatsapp,
} from './whatsapp-comprovante.ts'

const CHAVE = randomBytes(32)
const TOKEN = novoTokenConfirmacao()
const HASH = hashTokenConfirmacao(TOKEN)

test('o hash do token continua igual ao do banco e a cifra não guarda o texto', () => {
  assert.equal(hashSha256Token('abc'), 'sha256$ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0')
  assert.equal(hashTokenConfirmacao('abc'), null)
  assert.equal(HASH, hashSha256Token(TOKEN))
  assert.ok(HASH)
  const bloco = cifrarTokenLink(TOKEN, CHAVE, HASH!)
  assert.ok(bloco?.startsWith('v1.'))
  assert.equal(bloco?.includes(TOKEN), false)
  assert.equal(bloco?.includes(HASH!), false)
  assert.equal(decifrarTokenLink(bloco!, CHAVE, HASH!), TOKEN)
  assert.equal(decifrarTokenLink(bloco!, randomBytes(32), HASH!), null)
  assert.equal(decifrarTokenLink(bloco!, CHAVE, `${HASH!}x`), null)
  assert.equal(chaveTokenLink(CHAVE.toString('base64'))?.equals(CHAVE), true)
  assert.equal(chaveTokenLink('curta'), null)
  assert.equal(fs.readFileSync('lib/whatsapp-comprovante.ts', 'utf8').includes('console.'), false)
  assert.equal(fs.readFileSync('lib/whatsapp-comprovante-dados.ts', 'utf8').includes('console.'), false)
  assert.equal(fs.readFileSync('lib/whatsapp-comprovante-resumo.ts', 'utf8').includes('console.'), false)
  const tela = fs.readFileSync('app/adm/manutencoes/EnvioWhatsapp.tsx', 'utf8')
  assert.equal(tela.includes('whatsapp-comprovante-dados'), false)
  assert.equal(tela.includes('whatsapp-comprovante.ts'), false)
  assert.equal(tela.includes('window.open'), true)
  assert.equal(tela.includes("startsWith('https://wa.me/')"), true)
  assert.equal(tela.includes('Corrigir este registro'), false)
  assert.equal(tela.includes('Corrigir o ${nome} de'), true)
})

test('a mensagem real só usa a origem pública e o laboratório não abre o WhatsApp', () => {
  assert.equal(avaliarOrigemPublica('http://127.0.0.1:3010', '127.0.0.1:3010'), null)
  assert.equal(avaliarOrigemPublica('https://localhost', 'localhost'), null)
  assert.equal(avaliarOrigemPublica('https://manutencao.eleva.example/c', 'manutencao.eleva.example'), null)
  assert.deepEqual(avaliarOrigemPublica(ORIGEM_LABORATORIO_WHATSAPP, '127.0.0.1:3010'), {
    origem: ORIGEM_LABORATORIO_WHATSAPP,
    abrirWhatsapp: false,
  })
  assert.equal(avaliarOrigemPublica('https://manutencao.eleva.com.br', '127.0.0.1'), null)
  assert.deepEqual(avaliarOrigemPublica('https://manutencao.eleva.com.br', 'manutencao.eleva.com.br'), {
    origem: 'https://manutencao.eleva.com.br',
    abrirWhatsapp: true,
  })

  const bloco = cifrarTokenLink(TOKEN, CHAVE, HASH!)
  const bruto = {
    cifrado: bloco,
    token_hash: HASH,
    condominio: 'Condomínio Açores',
    whatsapp: '5519988887777',
  }
  const laboratorio = montarPreparacao({
    bruto,
    chave: CHAVE,
    origem: { origem: ORIGEM_LABORATORIO_WHATSAPP, abrirWhatsapp: false },
  })
  assert.equal('modo' in laboratorio && laboratorio.modo, 'laboratorio')
  if ('mensagem' in laboratorio) {
    assert.equal(laboratorio.mensagem.startsWith(IDENTIFICACAO_ELEVA), true)
    assert.equal(laboratorio.mensagem.includes('Condomínio Açores'), true)
    assert.equal(laboratorio.mensagem.includes(`${ORIGEM_LABORATORIO_WHATSAPP}/c/${TOKEN}`), true)
    assert.equal(laboratorio.mensagem.includes('Pedimos a confirmação do recebimento neste link.'), true)
    assert.equal(laboratorio.mensagem.includes('127.0.0.1'), false)
    assert.equal(laboratorio.mensagem.includes('localhost'), false)
    assert.equal('destino' in laboratorio, false)
  }
  const real = montarPreparacao({
    bruto,
    chave: CHAVE,
    origem: { origem: 'https://manutencao.eleva.com.br', abrirWhatsapp: true },
  })
  assert.equal('destino' in real && real.destino.startsWith('https://wa.me/5519988887777?text='), true)
  if ('destino' in real) {
    const texto = decodeURIComponent(real.destino.split('text=')[1] ?? '')
    assert.equal(texto.includes('https://manutencao.eleva.com.br/c/'), true)
    assert.equal(texto.includes('127.0.0.1'), false)
  }
  assert.equal(mensagemWhatsapp('Açores', 'http://127.0.0.1:3010/c/abc'), null)
  const lembrete = montarPreparacao({
    bruto,
    chave: CHAVE,
    origem: { origem: ORIGEM_LABORATORIO_WHATSAPP, abrirWhatsapp: false },
    lembrete: true,
  })
  assert.equal('mensagem' in lembrete, true)
  if ('mensagem' in lembrete) {
    assert.equal(lembrete.mensagem.includes('continua aguardando confirmação'), true)
    assert.equal(lembrete.mensagem.includes('Este é um lembrete do envio já realizado. O link segue o mesmo.'), true)
    assert.equal(lembrete.mensagem.includes('Segue o comprovante'), false)
    assert.equal(lembrete.mensagem.includes('Pedimos a confirmação do recebimento neste link.'), false)
    assert.equal(lembrete.mensagem.includes(`${ORIGEM_LABORATORIO_WHATSAPP}/c/${TOKEN}`), true)
  }
  assert.equal(telefoneWhatsapp('(19) 98888-7777'), '5519988887777')
  assert.equal(telefoneWhatsapp('5519988887777'), '5519988887777')
  assert.equal(telefoneWhatsapp('123'), null)
  assert.equal(destinoWhatsapp('123', 'ELEVA'), null)
})

test('o resumo do histórico não aceita segredo', () => {
  const id = 'e6111111-1111-4111-8111-111111111111'
  const resumo = resumoEnvio({
    pode_preparar: true,
    motivo: null,
    historico: [{
      id,
      classe: 'envio',
      registrado_em: '2026-10-26T18:00:00.000Z',
      responsavel: 'Ana ADM',
      correcao_em: null,
    }],
  })
  assert.equal(resumo?.historico[0]?.responsavel, 'Ana ADM')
  assert.equal(resumoEnvio({
    pode_preparar: false,
    motivo: 'sem_cifrado',
    cifrado: 'v1.segredo',
    historico: [],
  }), null)
  const publico = fs.readFileSync('app/c/CartaoLink.tsx', 'utf8')
  const leitura = fs.readFileSync('supabase/migrations/20261026140000_encerrar_link_confirmado.sql', 'utf8')
  assert.equal(/wa\.me|TOKEN_LINK_CHAVE|APP_PUBLIC_ORIGIN/i.test(publico), false)
  assert.equal(/wa\.me|cifrado/i.test(leitura), false)
})
