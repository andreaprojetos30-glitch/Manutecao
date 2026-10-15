import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const root = path.resolve(import.meta.dirname, '..')
const ler = (relativo) => fs.readFileSync(path.join(root, relativo), 'utf8')

const fundacao = ler('supabase/migrations/20261005180000_fundacao.sql').replace(
  /create extension if not exists pgcrypto;\s*/i,
  '',
)

if (/default\s+'prestador'/i.test(fundacao) || /:=\s*'prestador'/.test(fundacao)) {
  throw new Error('A migration não pode atribuir perfil prestador por padrão')
}
if (!fundacao.includes('raw_app_meta_data')) {
  throw new Error('O perfil precisa ser lido de app_metadata')
}
if (fundacao.includes("raw_user_meta_data->>'perfil'")) {
  throw new Error('O perfil não pode ser lido de user_metadata')
}
if (!fundacao.includes('perfil_explicito')) {
  throw new Error('Falta a função que só aceita admin ou prestador')
}

const db = new PGlite()

async function aplicar(nome, sql) {
  try {
    await db.exec(sql)
  } catch (error) {
    console.error(`Falhou em ${nome}: ${error.message}`)
    if (error.detail) console.error(error.detail)
    if (error.position) console.error(`posição ${error.position}`)
    process.exit(1)
  }
}

await aplicar('preparar', ler('supabase/tests/preparar.sql'))
await aplicar('fundacao', fundacao)
await aplicar('storage', ler('supabase/migrations/20261005180100_storage.sql'))
await aplicar('testes', ler('supabase/tests/fundacao.sql'))
await aplicar('cadastros', ler('supabase/migrations/20261005190000_cadastros.sql'))
await aplicar('matriz', ler('supabase/migrations/20261005210000_matriz_nome.sql'))
await aplicar('testes-cadastros', ler('supabase/tests/cadastros.sql'))
await aplicar('contratos', ler('supabase/migrations/20261005230000_contratos.sql'))
await aplicar('fim-contrato', ler('supabase/migrations/20261005240000_fim_contrato_calculado.sql'))
await aplicar('composicao', ler('supabase/migrations/20261005250000_composicao_contrato.sql'))
await aplicar('selecao', ler('supabase/migrations/20261005260000_selecao_equipamentos.sql'))
await aplicar('selecao-anon', ler('supabase/migrations/20261005261000_revoga_anon_selecao.sql'))
await aplicar('testes-contratos', ler('supabase/tests/contratos.sql'))
await aplicar('agenda', ler('supabase/migrations/20261009170000_agenda_manutencoes.sql'))
await aplicar('testes-agenda', ler('supabase/tests/agenda.sql'))
await aplicar('excluir-avulsa', ler('supabase/migrations/20261009180000_excluir_avulsa.sql'))
await aplicar('testes-exclusao-avulsa', ler('supabase/tests/exclusao-avulsa.sql'))
await aplicar('fotos-prestador', ler('supabase/migrations/20261010120000_fotos_prestador.sql'))
await aplicar('storage-fotos', ler('supabase/migrations/20261010130000_storage_fotos.sql'))
await aplicar('acesso-prestador', ler('supabase/migrations/20261010140000_acesso_prestador.sql'))
await aplicar('testes-execucao', ler('supabase/tests/execucao.sql'))
await aplicar('testes-acesso-prestador', ler('supabase/tests/acesso-prestador.sql'))
await aplicar('tratamento-ocorrencias', ler('supabase/migrations/20261014140000_tratamento_ocorrencias.sql'))
await aplicar('testes-tratamento-ocorrencias', ler('supabase/tests/tratamento-ocorrencias.sql'))

const fim = await db.query("select status from public.manutencoes where id = '00000000-0000-4000-8000-000000000060'")
if (fim.rows[0]?.status !== 'realizada') {
  throw new Error('A visita 0060 deveria terminar realizada')
}

console.log('banco ok')
