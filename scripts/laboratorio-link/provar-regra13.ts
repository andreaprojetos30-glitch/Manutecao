// Prova técnica do laboratório depois da Regra 13.
// Confirma só uma sonda descartável. A manutenção visual permanece sem confirmação.
// Não lê .env.local e só fala com 127.0.0.1.

import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { leituraDoLink, modoPdfPublico } from '../../lib/confirmacao-sindico.ts'
import {
  NOME_COOKIE_CONCESSAO,
  PRAZO_CONCESSAO_SEGUNDOS,
  abrirConcessao,
  emitirConcessao,
} from '../../lib/concessao-download.ts'

const HOST = '127.0.0.1'
const BANCO = 'eleva_manutencao_teste'
const PORTA_LAB = 54321
const PORTA_NEXT = 3010
const CHAVE = 'lab-eleva-local-somente-127'
const PSQL = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe'
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PDF = path.join(RAIZ, 'tmp', 'comprovante-laboratorio.pdf')
const VISUAL = '1ab00000-0000-4000-8000-0000000000a0'
const SONDA = '1ab00000-0000-4000-8000-0000000000b0'
const ITEM_SONDA = '1ab00000-0000-4000-8000-0000000000b1'
const CONDOMINIO = '1ab00000-0000-4000-8000-000000000010'
const ADMIN = '1ab00000-0000-4000-8000-000000000001'
const PRESTADOR = '1ab00000-0000-4000-8000-000000000030'
const EQUIPAMENTO = '1ab00000-0000-4000-8000-000000000040'
const ANTIGA = '1ab00000-0000-4000-8000-000000000070'
const TOKEN = /^[A-Za-z0-9_-]{43}$/
const URL_LAB = `http://${HOST}:${PORTA_LAB}`
const URL_NEXT = `http://${HOST}:${PORTA_NEXT}`

const tokenVisual = JSON.parse(readFileSync(path.join(RAIZ, 'tmp', 'laboratorio-link.json'), 'utf8')).visual as string
const tokenSonda = randomBytes(32).toString('base64url')

function exigir(condicao: unknown, mensagem: string) {
  if (!condicao) throw new Error(mensagem)
}

function ehPdf(bytes: Uint8Array) {
  return bytes.byteLength >= 5 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === '%PDF'
}

function ambiente(token = '') {
  const base: Record<string, string> = {}
  for (const nome of ['SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'COMSPEC', 'SYSTEMDRIVE']) {
    const valor = process.env[nome]
    if (valor) base[nome] = valor
  }
  base.PGCLIENTENCODING = 'UTF8'
  base.PGCONNECT_TIMEOUT = '5'
  if (token) base.LAB_TOKEN = token
  return base
}

function ambienteNext() {
  const base: Record<string, string> = {}
  for (const [nome, valor] of Object.entries(process.env)) {
    if (!valor) continue
    if (/supabase|database_url|pghost|pgport|pgdatabase|pguser|pgpassword|pgpassfile|^lab_token$/i.test(nome)) continue
    base[nome] = valor
  }
  base.NEXT_PUBLIC_SUPABASE_URL = URL_LAB
  base.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'lab-eleva-anon-somente-127'
  base.SUPABASE_SERVICE_ROLE_KEY = CHAVE
  return base
}

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

function psql(sql: string, token = '') {
  return new Promise<string>((resolve, reject) => {
    const filho = spawn(PSQL, [
      '-X', '-q', '-v', 'ON_ERROR_STOP=1',
      '-h', HOST, '-p', '5432', '-U', 'postgres', '-d', BANCO, '-f', '-',
    ], { shell: false, windowsHide: true, env: ambiente(token) })
    let saida = ''
    let erro = ''
    filho.stdout.setEncoding('utf8')
    filho.stderr.setEncoding('utf8')
    filho.stdout.on('data', (pedaco) => { saida += pedaco })
    filho.stderr.on('data', (pedaco) => { erro += pedaco })
    filho.on('error', reject)
    filho.on('close', (codigo) => {
      if (codigo !== 0) {
        const texto = erro.replace(/[A-Za-z0-9_-]{43}/g, '[token]').split('\n').map((linha) => linha.trim()).find((linha) => linha.startsWith('ERRO') || linha.startsWith('ERROR')) ?? 'consulta recusada'
        reject(new Error(texto.slice(0, 240)))
        return
      }
      resolve(saida.split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean).at(-1) ?? '')
    })
    filho.stdin.end(sql)
  })
}

async function foto() {
  return psql(`${GUARDA}
select (
  select count(*) from public.manutencoes where condominio_id is distinct from '${CONDOMINIO}'
)::text || ' ' || (
  select md5(string_agg(m.id::text || md5(to_jsonb(m.*)::text), '' order by m.id))
  from public.manutencoes m
  where m.condominio_id is distinct from '${CONDOMINIO}'
) || ' ' || (
  select md5(string_agg(m.id::text || md5(to_jsonb(m.*)::text), '' order by m.id))
  from public.manutencoes m
  where m.id in (
    '${ANTIGA}',
    '1ab00000-0000-4000-8000-000000000080',
    '1ab00000-0000-4000-8000-000000000090',
    '${VISUAL}'
  )
);
`)
}

function criarSonda() {
  return psql(`${GUARDA}
\\getenv lab_token LAB_TOKEN
begin;
insert into public.manutencoes (
  id, condominio_id, data_programada_original, data_programada_atual, prestador_id, tipo, origem, observacoes_administrativas
) values (
  '${SONDA}', '${CONDOMINIO}', date '2026-10-24', date '2026-10-24', '${PRESTADOR}', 'avulsa', 'manual', 'Sonda técnica do encerramento'
);
insert into public.itens_manutencao (id, manutencao_id, equipamento_matriz_id, nome_identificacao) values (
  '${ITEM_SONDA}', '${SONDA}', '${EQUIPAMENTO}', 'Sonda de encerramento'
);
select set_config('request.jwt.claim.sub', '${ADMIN}', true);
select public.registrar_ok('${ITEM_SONDA}');
select public.finalizar_manutencao('${SONDA}');
select public.registrar_comprovante('${SONDA}', '${SONDA}/comprovante.pdf', false);
select public.emitir_link_confirmacao_sindico('${SONDA}', :'lab_token', '${ADMIN}');
do $$
begin
  if (select count(*) from public.confirmacoes_sindico where manutencao_id = '${VISUAL}') <> 0 then
    raise exception 'A manutencao visual foi confirmada';
  end if;
end $$;
commit;
select 'SONDA_CRIADA';
`, tokenSonda)
}

function removerSonda() {
  return psql(`${GUARDA}
begin;
alter table public.links_confirmacao_sindico disable trigger links_confirmacao_sindico_imutavel;
alter table public.confirmacoes_sindico disable trigger confirmacoes_sindico_imutavel;
alter table public.manutencoes disable trigger manutencoes_excluir;
delete from public.historico_ocorrencias
where ocorrencia_id in (
  select o.id from public.ocorrencias o
  join public.itens_manutencao i on i.id = o.item_manutencao_id
  where i.manutencao_id = '${SONDA}'
);
delete from public.confirmacoes_sindico where manutencao_id = '${SONDA}';
delete from public.links_confirmacao_sindico where manutencao_id = '${SONDA}';
delete from public.ocorrencias where item_manutencao_id = '${ITEM_SONDA}';
delete from public.itens_manutencao where id = '${ITEM_SONDA}';
delete from public.manutencoes where id = '${SONDA}';
delete from public.auditoria where registro_id in ('${SONDA}', '${ITEM_SONDA}');
alter table public.manutencoes enable trigger manutencoes_excluir;
alter table public.confirmacoes_sindico enable trigger confirmacoes_sindico_imutavel;
alter table public.links_confirmacao_sindico enable trigger links_confirmacao_sindico_imutavel;
do $$
begin
  if exists (select 1 from public.manutencoes where id = '${SONDA}') then
    raise exception 'A sonda permaneceu';
  end if;
  if (select count(*) from public.confirmacoes_sindico where manutencao_id = '${VISUAL}') <> 0 then
    raise exception 'A manutencao visual foi confirmada';
  end if;
  if (select count(*) from public.confirmacoes_sindico where manutencao_id = '${ANTIGA}') <> 1 then
    raise exception 'A confirmacao antiga mudou';
  end if;
  if (select count(*) from public.manutencoes where condominio_id is distinct from '${CONDOMINIO}') <> 7 then
    raise exception 'As manutencoes anteriores mudaram';
  end if;
  if exists (
    select 1 from pg_trigger
    where tgname in (
      'links_confirmacao_sindico_imutavel',
      'confirmacoes_sindico_imutavel',
      'manutencoes_excluir'
    ) and tgenabled = 'D'
  ) then
    raise exception 'Gatilho de protecao ficou desligado';
  end if;
end $$;
commit;
select 'SONDA_REMOVIDA';
`)
}

async function rpc(funcao: 'ler' | 'registrar', token: string) {
  if (funcao === 'registrar' && token === tokenVisual) {
    throw new Error('A manutenção visual não pode ser confirmada neste teste')
  }
  const resposta = await fetch(`${URL_LAB}/rest/v1/rpc/${funcao === 'ler' ? 'ler_link_confirmacao_sindico' : 'registrar_confirmacao_sindico'}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${CHAVE}`,
      apikey: CHAVE,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_token: token }),
    signal: AbortSignal.timeout(15000),
  })
  const texto = await resposta.text()
  if (!resposta.ok) throw new Error(`O laboratório recusou a leitura do link (${resposta.status})`)
  return texto
}

async function baixarNoLaboratorio(manutencaoId: string) {
  const resposta = await fetch(`${URL_LAB}/storage/v1/object/pdfs/${manutencaoId}/comprovante.pdf`, {
    headers: { authorization: `Bearer ${CHAVE}`, apikey: CHAVE },
    signal: AbortSignal.timeout(15000),
  })
  const bytes = new Uint8Array(await resposta.arrayBuffer())
  return { status: resposta.status, bytes }
}

async function textoDoPdf(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice(), isEvalSupported: false, disableWorker: true } as Parameters<typeof getDocument>[0]).promise
  const paginas: string[] = []
  for (let numero = 1; numero <= pdf.numPages; numero += 1) {
    const pagina = await pdf.getPage(numero)
    const conteudo = await pagina.getTextContent()
    paginas.push(conteudo.items.map((item) => ('str' in item ? item.str : '')).filter(Boolean).join('\n'))
  }
  return paginas.join('\n')
}

function esperarTexto(filho: ChildProcess, trecho: string, milissegundos: number) {
  return new Promise<void>((resolve, reject) => {
    let saida = ''
    const timer = setTimeout(() => reject(new Error('O servidor local não ficou pronto')), milissegundos)
    const ouvir = (pedaco: Buffer | string) => {
      saida += pedaco.toString()
      if (saida.includes(trecho)) {
        clearTimeout(timer)
        resolve()
      }
    }
    filho.stdout?.on('data', ouvir)
    filho.stderr?.on('data', ouvir)
    filho.on('exit', () => {
      clearTimeout(timer)
      reject(new Error('O servidor local encerrou'))
    })
  })
}

async function encerrarProcesso(filho: ChildProcess | null) {
  if (!filho || filho.exitCode !== null) return
  await new Promise<void>((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(filho.pid), '/T', '/F'], { shell: false, windowsHide: true })
    killer.on('close', () => resolve())
    killer.on('error', () => resolve())
  })
}

async function pedirPagina(caminho: string, cookie?: string) {
  const resposta = await fetch(`${URL_NEXT}${caminho}`, {
    headers: cookie ? { cookie } : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(90000),
  })
  const corpo = await resposta.text()
  return { status: resposta.status, corpo, location: resposta.headers.get('location') ?? '', tipo: resposta.headers.get('content-type') ?? '', disposicao: resposta.headers.get('content-disposition') ?? '' }
}

function cookie(valor: string) {
  return `${NOME_COOKIE_CONCESSAO}=${valor}`
}

async function main() {
  exigir(TOKEN.test(tokenVisual), 'O link visual não está no formato esperado')
  exigir(TOKEN.test(tokenSonda) && tokenSonda !== tokenVisual, 'A sonda não recebeu um token próprio')
  exigir(!Object.values(JSON.parse(readFileSync(path.join(RAIZ, 'tmp', 'laboratorio-link.json'), 'utf8'))).filter((valor) => valor !== tokenVisual).includes(tokenSonda), 'A sonda reutilizou um token antigo')

  const destino = await psql(`${GUARDA} select current_database() || ' ' || host(inet_server_addr()) || ' ' || inet_server_port()::text;`)
  exigir(destino === `${BANCO} ${HOST} 5432`, 'O destino do banco não é o laboratório local')

  const hashOk = await psql(`${GUARDA}
\\getenv lab_token LAB_TOKEN
select (
  public.hash_token_confirmacao(:'lab_token') = (
    select token_hash from public.links_confirmacao_sindico
    where manutencao_id = '${VISUAL}' and revogado_em is null
  )
)::text;
`, tokenVisual)
  exigir(hashOk === 'true', 'O link visual não corresponde ao hash guardado')

  const fotoAntes = await foto()
  exigir(fotoAntes.startsWith('7 '), 'As sete manutenções anteriores não estão intactas antes da prova')

  const servidor = spawn(process.execPath, ['scripts/laboratorio-link/servidor.mjs'], {
    cwd: RAIZ,
    shell: false,
    windowsHide: true,
    env: ambiente(),
  })
  let diario = ''
  servidor.stdout?.on('data', (pedaco) => { diario += pedaco.toString() })
  servidor.stderr?.on('data', (pedaco) => { diario += pedaco.toString() })
  let next: ChildProcess | null = null
  let sondaCriada = false

  try {
    await esperarTexto(servidor, `laboratorio escutando ${HOST}:${PORTA_LAB}`, 10000)
    console.log('Laboratório local no ar.')

    const aberta = JSON.parse(await rpc('ler', tokenVisual)) as Record<string, unknown>
    exigir(aberta.situacao === undefined, 'O link visual já nasceu encerrado')
    exigir(aberta.condominio === 'Condomínio Laboratório ELEVA', 'A página visual não é a do laboratório')
    exigir(aberta.tipo === 'avulsa', 'A manutenção visual não é avulsa')
    exigir(String(aberta.data_efetiva).startsWith('2026-10-26'), 'A data efetiva da manutenção visual não é 26/10/2026')
    exigir(aberta.caminho_pdf === `${VISUAL}/comprovante.pdf`, 'O comprovante visual aponta para outro arquivo')
    exigir(aberta.confirmado_em == null, 'A manutenção visual já tem confirmação')
    exigir(!JSON.stringify(aberta).toLowerCase().includes('whatsapp'), 'A leitura pública expôs um contato')
    console.log('Link visual abre a manutenção de 26/10/2026.')

    const pdfVisual = await baixarNoLaboratorio(VISUAL)
    exigir(pdfVisual.status === 200 && ehPdf(pdfVisual.bytes), `O comprovante visual não foi baixado (${pdfVisual.status})`)
    exigir(Buffer.compare(pdfVisual.bytes, readFileSync(PDF)) === 0, 'O laboratório serviu um PDF diferente do comprovante visual')
    const textoVisual = await textoDoPdf(pdfVisual.bytes)
    exigir(
      ['MANUTENÇÃO AVULSA', 'Condomínio Laboratório ELEVA', '26/10/2026', 'Equipamento Laboratório Visual', 'Prestador Laboratório']
        .every((trecho) => textoVisual.includes(trecho))
        && !/Açores|VISITA 2\/12|18\/03\/2026|25\/10\/2026/.test(textoVisual),
      'O PDF visual não corresponde à manutenção nova',
    )
    console.log('PDF visual confere com a manutenção nova.')

    await criarSonda()
    sondaCriada = true
    const sondaAberta = JSON.parse(await rpc('ler', tokenSonda)) as Record<string, unknown>
    exigir(sondaAberta.manutencao_id === SONDA && sondaAberta.caminho_pdf === `${SONDA}/comprovante.pdf`, 'A sonda não abriu o próprio comprovante')
    await rpc('registrar', tokenSonda)
    const encerrada = JSON.parse(await rpc('ler', tokenSonda)) as Record<string, unknown>
    exigir(Object.keys(encerrada).sort().join() === 'manutencao_id,situacao', 'O link encerrado devolveu dados da visita')
    exigir(encerrada.situacao === 'encerrada' && encerrada.manutencao_id === SONDA, 'O link da sonda não encerrou')
    const visualDepois = JSON.parse(await rpc('ler', tokenVisual)) as Record<string, unknown>
    exigir(visualDepois.confirmado_em == null && visualDepois.caminho_pdf === `${VISUAL}/comprovante.pdf`, 'A confirmação da sonda alterou o link visual')
    const confirmacoesVisuais = await psql(`${GUARDA} select count(*)::text from public.confirmacoes_sindico where manutencao_id = '${VISUAL}';`)
    exigir(confirmacoesVisuais === '0', 'A manutenção visual foi confirmada')
    console.log('O link da sonda encerrou e o link visual continua aberto.')

    const pdfSonda = await baixarNoLaboratorio(SONDA)
    exigir(pdfSonda.status === 200 && ehPdf(pdfSonda.bytes), 'O arquivo privado ficou indisponível depois da confirmação')

    const agora = Math.floor(Date.now() / 1000)
    const concessao = emitirConcessao(SONDA, agora, CHAVE)
    exigir(concessao, 'Não foi possível emitir o cookie de 30 minutos')
    const dentro = abrirConcessao(concessao, agora + PRAZO_CONCESSAO_SEGUNDOS - 1, CHAVE)
    const fora = abrirConcessao(concessao, agora + PRAZO_CONCESSAO_SEGUNDOS, CHAVE)
    const leitura = leituraDoLink(encerrada)
    exigir(dentro?.manutencaoId === SONDA, 'O cookie não vale durante os 30 minutos')
    exigir(fora === null, 'O cookie continuou valendo depois de 30 minutos')
    exigir(modoPdfPublico(leitura, dentro)?.modo === 'attachment', 'A baixa dos 30 minutos não ficou como download')
    exigir(modoPdfPublico(leitura, dentro)?.caminho === `${SONDA}/comprovante.pdf`, 'A baixa dos 30 minutos apontou para outro comprovante')
    exigir(modoPdfPublico(leitura, null) === null, 'A baixa foi liberada sem cookie')
    exigir(modoPdfPublico(leitura, { manutencaoId: VISUAL }) === null, 'O cookie de outra manutenção liberou a sonda')
    const expirado = emitirConcessao(SONDA, agora - PRAZO_CONCESSAO_SEGUNDOS, CHAVE)
    const deOutra = emitirConcessao(VISUAL, agora, CHAVE)
    exigir(expirado && deOutra, 'Não foi possível montar os cookies de controle')
    console.log('O cookie libera a baixa por 30 minutos e recusa o prazo vencido.')

    next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', HOST, '-p', String(PORTA_NEXT)], {
      cwd: RAIZ,
      shell: false,
      windowsHide: true,
      env: ambienteNext(),
    })
    let diarioNext = ''
    const guardarNext = (pedaco: Buffer | string) => {
      diarioNext += pedaco.toString().replace(/[A-Za-z0-9_-]{43}/g, '[token]')
      if (diarioNext.length > 8000) diarioNext = diarioNext.slice(-4000)
    }
    next.stdout?.on('data', guardarNext)
    next.stderr?.on('data', guardarNext)
    const limiteNext = Date.now() + 30000
    while (!diarioNext.includes('Ready') && Date.now() < limiteNext) {
      if (next.exitCode !== null) throw new Error('O Next encerrou antes de atender')
      await new Promise((resolver) => setTimeout(resolver, 200))
    }
    exigir(diarioNext.includes('Ready'), 'O Next não ficou pronto')
    const marcas = diario.length

    const pagina = await pedirPagina(`/c/${tokenVisual}`)
    const limitePagina = Date.now() + 3000
    while (!diario.slice(marcas).includes('POST rpc:ler') && Date.now() < limitePagina) {
      await new Promise((resolver) => setTimeout(resolver, 50))
    }
    exigir(pagina.status === 200, 'A página visual não abriu')
    exigir(diario.slice(marcas).includes('POST rpc:ler'), 'A página visual não passou pelo laboratório local')
    exigir(pagina.corpo.includes('Condomínio Laboratório ELEVA'), 'A página visual não mostrou o condomínio do laboratório')
    exigir(pagina.corpo.includes('MANUTENÇÃO AVULSA') && pagina.corpo.includes('26/10/2026'), 'A página visual não mostrou a manutenção nova')
    exigir(pagina.corpo.includes('Confirmar manutenção e baixar PDF'), 'A página visual não oferece a confirmação')
    exigir(!pagina.corpo.includes('já foi registrada') && !pagina.corpo.includes('Confirmação registrada'), 'A página visual já aparece como confirmada')
    console.log('A página visual está pronta para o clique.')

    const sucessoCedo = await pedirPagina(`/c/${tokenVisual}/pronto`)
    exigir(sucessoCedo.status >= 300 && sucessoCedo.status < 400, 'A tela de sucesso abriu antes da confirmação')
    const destinoCedo = new URL(sucessoCedo.location, URL_NEXT)
    exigir(destinoCedo.pathname === `/c/${tokenVisual}`, 'A tela de sucesso não voltou para o link aberto')

    const encerradaPagina = await pedirPagina(`/c/${tokenSonda}`)
    exigir(encerradaPagina.status === 200 && encerradaPagina.corpo.includes('O link está encerrado'), 'O link original da sonda continuou aberto')
    exigir(!encerradaPagina.corpo.includes('Confirmar manutenção') && !encerradaPagina.corpo.includes('leitura-pdf'), 'O link encerrado ainda mostra o comprovante')

    const semCookie = await pedirPagina(`/c/${tokenSonda}/pronto`)
    exigir(semCookie.status === 200 && semCookie.corpo.includes('O link está encerrado'), 'A tela de sucesso abriu sem o cookie')
    const comCookie = await pedirPagina(`/c/${tokenSonda}/pronto`, cookie(concessao))
    exigir(comCookie.status === 200 && comCookie.corpo.includes('Confirmação registrada') && comCookie.corpo.includes('Baixar meu comprovante'), 'A tela de sucesso não apareceu com o cookie válido')
    exigir(!comCookie.corpo.includes('leitura-pdf'), 'A tela de sucesso voltou a embutir o comprovante')
    const cookieVencido = await pedirPagina(`/c/${tokenSonda}/pronto`, cookie(expirado))
    exigir(cookieVencido.corpo.includes('O link está encerrado'), 'A tela de sucesso aceitou o cookie vencido')
    const cookieAlheio = await pedirPagina(`/c/${tokenSonda}/pronto`, cookie(deOutra))
    exigir(cookieAlheio.corpo.includes('O link está encerrado'), 'A tela de sucesso aceitou o cookie de outra manutenção')
    console.log('A tela de sucesso respeita o cookie temporário.')

    const baixa = await fetch(`${URL_NEXT}/c/${tokenSonda}/pdf`, {
      headers: { cookie: cookie(concessao) },
      signal: AbortSignal.timeout(90000),
    })
    const bytesBaixa = new Uint8Array(await baixa.arrayBuffer())
    exigir(baixa.status === 200 && ehPdf(bytesBaixa), 'A baixa dos 30 minutos não devolveu o PDF')
    exigir((baixa.headers.get('content-disposition') ?? '').startsWith('attachment'), 'A baixa dos 30 minutos não veio como download')
    const semBaixa = await fetch(`${URL_NEXT}/c/${tokenSonda}/pdf`, { signal: AbortSignal.timeout(90000) })
    exigir(semBaixa.status === 404, 'A baixa funcionou sem cookie')
    const baixaVencida = await fetch(`${URL_NEXT}/c/${tokenSonda}/pdf`, {
      headers: { cookie: cookie(expirado) },
      signal: AbortSignal.timeout(90000),
    })
    exigir(baixaVencida.status === 404, 'A baixa funcionou com o cookie vencido')
    const baixaAlheia = await fetch(`${URL_NEXT}/c/${tokenSonda}/pdf`, {
      headers: { cookie: cookie(deOutra) },
      signal: AbortSignal.timeout(90000),
    })
    exigir(baixaAlheia.status === 404, 'A baixa funcionou com o cookie de outra manutenção')
    console.log('A baixa funciona durante os 30 minutos e para ao vencer o cookie.')
  } finally {
    await encerrarProcesso(next)
    await encerrarProcesso(servidor)
    if (sondaCriada) {
      try {
        await removerSonda()
      } catch (falha) {
        console.error(falha instanceof Error ? falha.message : 'A sonda não foi removida')
        process.exitCode = 1
      }
    }
  }

  const fotoDepois = await foto()
  exigir(fotoDepois === fotoAntes, 'As manutenções anteriores ou a visita visual foram alteradas')
  const confirmacoesVisuais = await psql(`${GUARDA} select count(*)::text from public.confirmacoes_sindico where manutencao_id = '${VISUAL}';`)
  exigir(confirmacoesVisuais === '0', 'A manutenção visual ficou confirmada')
  const sondaRestou = await psql(`${GUARDA} select count(*)::text from public.manutencoes where id = '${SONDA}';`)
  exigir(sondaRestou === '0', 'A sonda de encerramento permaneceu no banco')
  console.log('Prova concluída. A manutenção visual segue sem confirmação.')
}

main().catch((falha: unknown) => {
  const mensagem = falha instanceof Error ? falha.message : 'A prova do laboratório falhou'
  console.error(mensagem.replace(/[A-Za-z0-9_-]{43}/g, '[token]'))
  process.exitCode = 1
})
