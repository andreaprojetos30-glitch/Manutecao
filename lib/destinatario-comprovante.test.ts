import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { executarConfirmacao, resumoDoLink } from './confirmacao-sindico.ts'
import { mensagemManutencao } from './manutencoes.ts'
import { rotuloPapelDestinatario, validarDestinatario } from './destinatario-comprovante.ts'

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'

test('a indicação exige papel, nome e WhatsApp, e outro exige complemento', () => {
  const base = {
    papel: 'gerente',
    nome: 'Ana',
    whatsapp: '11999990000',
    email: '',
    complemento: 'ignorado',
    dataInicio: '2026-10-26',
  }
  const gerente = validarDestinatario(base)
  assert.equal(gerente.erro, null)
  assert.equal(gerente.dados?.papel, 'gerente')
  assert.equal(gerente.dados?.complemento, null)
  assert.equal(validarDestinatario({ ...base, papel: 'sindico' }).erro, 'Informe o papel de quem recebe os comprovantes.')
  assert.equal(validarDestinatario({ ...base, whatsapp: '  ' }).erro, 'Informe o WhatsApp de quem recebe os comprovantes.')
  assert.equal(
    validarDestinatario({ ...base, papel: 'outro', complemento: '  ' }).erro,
    'Informe qual é o responsável.',
  )
  const outro = validarDestinatario({ ...base, papel: 'outro', complemento: ' Zelador ' })
  assert.equal(outro.dados?.complemento, 'Zelador')
  assert.equal(rotuloPapelDestinatario('administradora'), 'representante da administradora')
  assert.equal(rotuloPapelDestinatario('outro', 'Zelador'), 'Zelador')
  assert.equal(rotuloPapelDestinatario('sindico'), 'síndico')
})

test('o resumo antigo continua válido e o novo traz o responsável', () => {
  const antigo = resumoDoLink({
    link_ativo: true,
    emitido_em: '2026-10-25T15:00:00Z',
    confirmado_em: '2026-10-25T18:00:00Z',
    sindico_nome: 'Helena',
    meio: 'link',
  })
  assert.equal(antigo?.sindicoNome, 'Helena')
  assert.equal(antigo?.destinatarioNome, null)
  assert.equal(antigo?.destinatarioPapel, null)

  const atual = resumoDoLink({
    link_ativo: true,
    emitido_em: '2026-10-26T12:00:00Z',
    confirmado_em: null,
    sindico_nome: null,
    meio: null,
    destinatario_nome: 'Gerente Ana',
    destinatario_papel: 'gerente',
    destinatario_complemento: null,
  })
  assert.equal(atual?.destinatarioNome, 'Gerente Ana')
  assert.equal(atual?.destinatarioPapel, 'gerente')
  assert.equal(atual?.sindicoNome, null)
})

test('um link sem responsável autorizado não confirma em outro nome', async () => {
  const resultado = await executarConfirmacao(TOKEN, {
    async ler() {
      return {
        manutencao_id: 'a1111111-1111-4111-8111-111111111111',
        condominio: 'Porta do Sol',
        tipo: 'avulsa',
        numero_visita: null,
        quantidade_visitas: null,
        data_efetiva: '2026-10-25',
        caminho_pdf: 'a1111111-1111-4111-8111-111111111111/comprovante.pdf',
        confirmado_em: null,
        sindico_nome: null,
        meio: null,
      }
    },
    async registrar() {
      return { erro: 'Este link não pertence mais ao responsável autorizado' }
    },
  })
  assert.equal(resultado.estado, 'indisponivel')
  assert.equal(
    mensagemManutencao('Este link não pertence mais ao responsável autorizado'),
    'Este link não pertence mais ao responsável autorizado.',
  )
  assert.equal(
    mensagemManutencao('Could not find the function public.definir_destinatario_comprovante'),
    'O responsável pelo recebimento ainda não está disponível. Aplique a atualização do banco.',
  )
})

test('a migração não reescreve manutenções nem envia WhatsApp', () => {
  const sql = fs.readFileSync('supabase/migrations/20261026130000_destinatario_comprovante.sql', 'utf8')
  const cartao = fs.readFileSync('app/c/CartaoLink.tsx', 'utf8')
  assert.equal(/update\s+public\.manutencoes/i.test(sql), false)
  assert.equal(/wa\.me|api\.whatsapp/i.test(sql), false)
  assert.equal(cartao.includes('Este registro não autentica a identidade de quem clicou.'), true)
  assert.equal(cartao.includes('não autentica a identidade de quem clicou.'), true)
  assert.equal(/whatsapp/i.test(cartao), false)
})
