// Prepara o laboratório local do WhatsApp.
// Não lê .env.local, não imprime a chave e não confirma a manutenção de conferência.

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { novoTokenConfirmacao } from '../../lib/confirmacao-sindico.ts'
import {
  ORIGEM_LABORATORIO_WHATSAPP,
  chaveTokenLink,
  cifrarTokenLink,
  decifrarTokenLink,
  hashTokenConfirmacao,
} from '../../lib/whatsapp-comprovante.ts'
import { montarPreparacao } from '../../lib/whatsapp-comprovante-dados.ts'

const HOST = '127.0.0.1'
const BANCO = 'eleva_manutencao_teste'
const PSQL = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe'
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SEGREDO = path.join(RAIZ, 'tmp', 'laboratorio-whatsapp.env')
const MIGRACAO = path.join(RAIZ, 'supabase', 'migrations', '20261026150000_envio_whatsapp_comprovante.sql')
const DADOS = path.join(RAIZ, 'scripts', 'laboratorio-link', 'preparar-whatsapp.sql')
const VISITA = '1ab00000-0000-4000-8000-0000000000c0'
const ADMIN = '1ab00000-0000-4000-8000-000000000001'
const ORIGEM = ORIGEM_LABORATORIO_WHATSAPP

const GUARDA = String.raw`
\set ON_ERROR_STOP on
\set HISTFILE
\pset pager off
\pset tuples_only on
\pset format unaligned
\pset footer off
do $guarda$
begin
  if current_database() is distinct from 'eleva_manutencao_teste' then
    raise exception 'Banco recusado';
  end if;
  if inet_server_addr() is distinct from '127.0.0.1'::inet then
    raise exception 'Servidor recusado';
  end if;
  if inet_server_port() is distinct from 5432 then
    raise exception 'Porta recusada';
  end if;
end
$guarda$;
`

function exigir(condicao: unknown, mensagem: string) {
  if (!condicao) throw new Error(mensagem)
}

function redigir(texto: string) {
  return texto
    .replace(/sha256\$[A-Za-z0-9_-]+/g, '[hash]')
    .replace(/v1\.[A-Za-z0-9_-]+/g, '[cifrado]')
    .replace(/[A-Za-z0-9_-]{43}/g, '[token]')
}

function ambiente(extra: Record<string, string> = {}) {
  const base: Record<string, string> = {}
  for (const nome of ['SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'COMSPEC', 'SYSTEMDRIVE']) {
    const valor = process.env[nome]
    if (valor) base[nome] = valor
  }
  base.PGCLIENTENCODING = 'UTF8'
  base.PGCONNECT_TIMEOUT = '8'
  return { ...base, ...extra }
}

function psql(sql: string, extra: Record<string, string> = {}) {
  return new Promise<string>((resolve, reject) => {
    const filho = spawn(PSQL, [
      '-X', '-q', '-v', 'ON_ERROR_STOP=1',
      '-h', HOST, '-p', '5432', '-U', 'postgres', '-d', BANCO, '-f', '-',
    ], { shell: false, windowsHide: true, env: ambiente(extra) })
    let saida = ''
    let erro = ''
    filho.stdout.setEncoding('utf8')
    filho.stderr.setEncoding('utf8')
    filho.stdout.on('data', (pedaco) => { saida += pedaco })
    filho.stderr.on('data', (pedaco) => { erro += pedaco })
    filho.on('error', reject)
    filho.on('close', (codigo) => {
      if (codigo !== 0) {
        reject(new Error(redigir(erro).split('\n').map((linha) => linha.trim()).find((linha) => linha.startsWith('ERRO') || linha.startsWith('ERROR')) ?? 'consulta recusada'))
        return
      }
      resolve(saida.split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean).at(-1) ?? '')
    })
    filho.stdin.end(`${GUARDA}\n${sql}\n`)
  })
}

function psqlArquivo(arquivo: string) {
  return psql(readFileSync(arquivo, 'utf8'))
}

function carregarChave() {
  if (!existsSync(SEGREDO)) {
    const chave = randomBytes(32).toString('base64')
    writeFileSync(SEGREDO, `TOKEN_LINK_CHAVE=${chave}\nAPP_PUBLIC_ORIGIN=${ORIGEM}\n`, { encoding: 'utf8', flag: 'wx' })
    console.log('Chave do laboratório gravada fora do Git. O valor não é exibido.')
  } else {
    console.log('Chave do laboratório reutilizada. O valor não é exibido.')
  }
  const linhas = readFileSync(SEGREDO, 'utf8').split(/\r?\n/)
  const mapa = new Map<string, string>()
  for (const linha of linhas) {
    const corte = linha.indexOf('=')
    if (corte > 0) mapa.set(linha.slice(0, corte), linha.slice(corte + 1))
  }
  const origem = mapa.get('APP_PUBLIC_ORIGIN')
  const chave = chaveTokenLink(mapa.get('TOKEN_LINK_CHAVE'))
  exigir(origem === ORIGEM, 'A origem pública do laboratório não está autorizada.')
  exigir(chave, 'A chave do laboratório está ausente ou inválida.')
  return chave!
}

async function foto(excluirNova: boolean) {
  const filtro = excluirNova
    ? "id <> '1ab00000-0000-4000-8000-0000000000c0'"
    : 'true'
  return psql(`
    select json_build_object(
      'anteriores', (select count(*) from public.manutencoes where id::text not like '1ab00000-%'),
      'foto_anteriores', (select md5(coalesce(string_agg(id::text || status || coalesce(pdf_url, ''), ',' order by id), '')) from public.manutencoes where id::text not like '1ab00000-%'),
      'foto_laboratorio', (select md5(coalesce(string_agg(id::text || status || coalesce(pdf_url, '') || (revogado.total::text), ',' order by m.id), ''))
        from public.manutencoes m
        cross join lateral (
          select count(*) as total from public.links_confirmacao_sindico link where link.manutencao_id = m.id
        ) revogado
        where m.id::text like '1ab00000-%' and ${filtro === 'true' ? 'true' : "m.id <> '1ab00000-0000-4000-8000-0000000000c0'"})
    )::text
  `)
}

async function main() {
  const destino = await psql(`select current_database() || ' ' || host(inet_server_addr()) || ' ' || inet_server_port()::text`)
  exigir(destino === `${BANCO} ${HOST} 5432`, 'O destino do banco não é o laboratório local')
  console.log(`Destino confirmado: ${HOST}:5432/${BANCO}`)

  const antes = await foto(true)
  const chave = carregarChave()
  const migrada = await psql(`select to_regclass('public.links_confirmacao_cifrado') is not null`)
  if (migrada === 't') console.log('Migração do WhatsApp já estava aplicada neste banco.')
  else {
    await psqlArquivo(MIGRACAO)
    console.log('Migração aplicada somente neste banco.')
  }

  await psqlArquivo(DADOS)
  console.log('Manutenção fictícia com comprovante liberado.')

  const ativo = await psql(`
    select exists (
      select 1 from public.links_confirmacao_sindico
      where manutencao_id = '${VISITA}' and revogado_em is null
    )
  `)
  if (ativo !== 't') {
    const token = novoTokenConfirmacao()
    const hash = hashTokenConfirmacao(token)
    const cifrado = hash ? cifrarTokenLink(token, chave, hash) : null
    exigir(hash && cifrado, 'Não foi possível cifrar o link do laboratório.')
    await psql(`
      \\getenv lab_hash LAB_HASH
      \\getenv lab_cifra LAB_CIFRA
      begin;
      select set_config('request.jwt.claim.sub', '${ADMIN}', true);
      select public.emitir_link_confirmacao_cifrado(
        '${VISITA}',
        :'lab_hash',
        :'lab_cifra',
        '${ADMIN}'
      );
      commit;
    `, { LAB_HASH: hash!, LAB_CIFRA: cifrado! })
    console.log('Link válido cifrado. O token não é exibido.')
  } else {
    console.log('Link válido já existia. Nenhum token novo foi emitido.')
  }

  const bruto = JSON.parse(await psql(`
    with leitura as (
      select public.ler_cifrado_para_envio('${VISITA}'::uuid, '${ADMIN}'::uuid) as dados
    )
    select json_build_object(
      'cifrado', dados->>'cifrado',
      'hash', dados->>'token_hash',
      'condominio', dados->>'condominio',
      'whatsapp', dados->>'whatsapp',
      'erro', dados->>'erro',
      'pode_preparar', (public.resumo_envio_whatsapp('${VISITA}'::uuid)->>'pode_preparar') = 'true',
      'confirmada', exists (select 1 from public.confirmacoes_sindico where manutencao_id = '${VISITA}'),
      'envios', (select count(*) from public.comunicacoes_comprovante where manutencao_id = '${VISITA}'),
      'anon', has_table_privilege('anon', 'public.links_confirmacao_cifrado', 'select'),
      'authenticated', has_table_privilege('authenticated', 'public.links_confirmacao_cifrado', 'select'),
      'service', has_table_privilege('service_role', 'public.links_confirmacao_cifrado', 'select')
    )::text
    from leitura
  `)) as {
    cifrado: string
    hash: string
    condominio: string
    whatsapp: string
    erro: string | null
    pode_preparar: boolean
    confirmada: boolean
    envios: number
    anon: boolean
    authenticated: boolean
    service: boolean
  }

  exigir(!bruto.erro && bruto.pode_preparar, 'A manutenção fictícia não ficou pronta para conferência.')
  exigir(bruto.confirmada === false && Number(bruto.envios) === 0, 'A manutenção de conferência foi confirmada ou teve envio.')
  exigir(bruto.anon === false && bruto.authenticated === false && bruto.service === false, 'A tabela cifrada ficou legível fora do servidor.')
  const token = decifrarTokenLink(bruto.cifrado, chave, bruto.hash)
  exigir(token && hashTokenConfirmacao(token) === bruto.hash, 'O servidor não recuperou o link com a chave do laboratório.')
  const preparo = montarPreparacao({
    bruto: {
      cifrado: bruto.cifrado,
      token_hash: bruto.hash,
      condominio: bruto.condominio,
      whatsapp: bruto.whatsapp,
    },
    chave,
    origem: { origem: ORIGEM, abrirWhatsapp: false },
  })
  exigir(preparo && 'modo' in preparo && preparo.modo === 'laboratorio', 'A conferência abriria o WhatsApp real.')
  if ('mensagem' in preparo) {
    exigir(preparo.mensagem.startsWith('ELEVA'), 'A mensagem não identifica a ELEVA.')
    exigir(preparo.mensagem.includes('Condomínio WhatsApp Laboratório'), 'A mensagem não identifica o condomínio.')
    exigir(preparo.mensagem.includes(`${ORIGEM}/c/`), 'A mensagem não usa a origem do laboratório.')
    exigir(!preparo.mensagem.includes('127.0.0.1') && !preparo.mensagem.includes('localhost'), 'A mensagem contém endereço local.')
    exigir(!('destino' in preparo), 'A conferência devolveu um destino de WhatsApp.')
  }
  console.log('Mensagem de conferência montada, sem abrir o WhatsApp.')

  const depois = await foto(true)
  exigir(antes === depois, 'Manutenções anteriores foram alteradas.')
  const anteriores = await psql(`select count(*) from public.manutencoes where id::text not like '1ab00000-%'`)
  exigir(anteriores === '7', 'A quantidade de manutenções anteriores mudou.')
  console.log('Sete manutenções anteriores e os testes já gravados permanecem como estavam.')
  console.log('Nenhum envio foi registrado e a manutenção de conferência segue sem confirmação.')
}

main().catch((falha: unknown) => {
  console.error(redigir(falha instanceof Error ? falha.message : 'A preparação do laboratório falhou.'))
  process.exit(1)
})
