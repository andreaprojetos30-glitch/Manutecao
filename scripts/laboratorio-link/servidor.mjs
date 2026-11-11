// Servidor mínimo do laboratório. Escuta só em 127.0.0.1.
// Não lê .env.local e não usa endereço externo como alternativa.

import { spawn } from 'node:child_process'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = '127.0.0.1'
const PORTA = 54321
const BANCO = 'eleva_manutencao_teste'
const CHAVE = 'lab-eleva-local-somente-127'
const ANON = 'lab-eleva-anon-somente-127'
const PSQL = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe'
const ADMIN_ID = '1ab00000-0000-4000-8000-000000000001'
const VISITA_WHATSAPP = '1ab00000-0000-4000-8000-0000000000c0'
const EMAIL_LAB = 'adm.laboratorio@eleva.teste'
const SENHA_LAB = 'laboratorio-local'
// Comprovante da manutenção fictícia. O exemplo tmp/comprovante-visita.pdf é outra visita.
const PDF_FIXO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tmp/comprovante-laboratorio.pdf')
const PASTA_CONFIRMACAO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tmp/laboratorio-confirmacoes')
const TOKEN = /^[A-Za-z0-9_-]{43}$/
const CAMINHO_PDF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/comprovante\.pdf$/
const CODIGO_DOCUMENTO = /^CM-[0-9]{4}-[0-9]{6}(-D)?$/
const CONFIRMACAO_MANUAL = new Set([
  'resumo_confirmacao_comprovante',
  'registrar_confirmacao_manual',
  'corrigir_confirmacao_manual',
  'garantir_documento_confirmacao',
  'ler_documento_confirmacao',
])
const ROTAS = new Set(['ler_link_confirmacao_sindico', 'registrar_confirmacao_sindico'])
const ACOMPANHAMENTO = new Set([
  'fatos_acompanhamento_comprovantes',
  'ficha_acompanhamento_comprovante',
  'ativar_acompanhamento_comprovantes',
  'incluir_comprovante_no_acompanhamento',
])
const SELECT_LISTA = 'id,tipo,numero_visita,data_programada_atual,data_realizada,registro_anterior,status,prestador_id,condominios(nome),prestadores(nome),contratos(quantidade_visitas)'
const STATUS_VISITA = new Set(['programada', 'em_execucao', 'aguardando_administracao', 'realizada', 'cancelada'])
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function sqlListaManutencoes(params) {
  if (params.get('select') !== SELECT_LISTA) return null
  if (params.get('order') !== 'data_programada_atual.asc') return null
  if (params.get('limit') !== '400') return null
  for (const chave of params.keys()) {
    if (!['select', 'order', 'limit', 'status', 'prestador_id', 'data_programada_atual'].includes(chave)) return null
  }

  const filtros = []
  const status = params.get('status')
  if (status) {
    const valor = status.startsWith('eq.') ? status.slice(3) : ''
    if (!STATUS_VISITA.has(valor)) return null
    filtros.push(`m.status = '${valor}'`)
  }

  const prestador = params.get('prestador_id')
  if (prestador === 'is.null') {
    filtros.push('m.prestador_id is null')
  } else if (prestador) {
    const valor = prestador.startsWith('eq.') ? prestador.slice(3) : ''
    if (!UUID.test(valor)) return null
    filtros.push(`m.prestador_id = '${valor.toLowerCase()}'`)
  }

  const datas = params.getAll('data_programada_atual')
  if (datas.length > 2) return null
  let teveInicio = false
  let teveFim = false
  for (const item of datas) {
    if (item.startsWith('gte.') && DATA_ISO.test(item.slice(4)) && !teveInicio) {
      teveInicio = true
      filtros.push(`m.data_programada_atual >= '${item.slice(4)}'`)
    } else if (item.startsWith('lte.') && DATA_ISO.test(item.slice(4)) && !teveFim) {
      teveFim = true
      filtros.push(`m.data_programada_atual <= '${item.slice(4)}'`)
    } else {
      return null
    }
  }

  const where = filtros.length ? `where ${filtros.join(' and ')}` : ''
  return `${GUARDA}
select coalesce((
  select json_agg(item.linha order by item.data_programada_atual, item.id)
  from (
    select
      m.data_programada_atual,
      m.id,
      json_build_object(
        'id', m.id,
        'tipo', m.tipo,
        'numero_visita', m.numero_visita,
        'data_programada_atual', m.data_programada_atual,
        'data_realizada', m.data_realizada,
        'registro_anterior', m.registro_anterior,
        'status', m.status,
        'prestador_id', m.prestador_id,
        'condominios', json_build_object('nome', c.nome),
        'prestadores', case when p.id is null then null else json_build_object('nome', p.nome) end,
        'contratos', case when ct.id is null then null else json_build_object('quantidade_visitas', ct.quantidade_visitas) end
      ) as linha
    from public.manutencoes m
    join public.condominios c on c.id = m.condominio_id
    left join public.prestadores p on p.id = m.prestador_id
    left join public.contratos ct on ct.id = m.contrato_id
    ${where}
    order by m.data_programada_atual asc, m.id asc
    limit 400
  ) item
)::text, '[]');
`
}

const SELECT_CONDOMINIO = 'id,nome,cep,endereco,numero,complemento,bairro,cidade,estado,quantidade_unidades,ativo,observacoes'
const SELECT_SINDICO = 'id,nome,whatsapp,email,data_inicio,data_fim,ativo'
const SELECT_DESTINATARIO = 'id,papel,complemento,nome,whatsapp,email,data_inicio,data_fim,ativo'
const SELECT_CONTRATO = 'id,numero_contrato,quantidade_visitas,data_inicio_manutencao,status'

function idEq(params, chave) {
  const valor = params.get(chave)
  if (!valor || !valor.startsWith('eq.')) return null
  const id = valor.slice(3).toLowerCase()
  if (!UUID.test(id)) return null
  return id
}

function sqlFichaCondominio(tabela, params) {
  const chaves = [...params.keys()]
  if (tabela === 'condominios') {
    if (params.get('select') !== SELECT_CONDOMINIO) return null
    if (chaves.some((chave) => !['select', 'id'].includes(chave))) return null
    const id = idEq(params, 'id')
    if (!id) return null
    return `${GUARDA}
select coalesce((
  select json_agg(json_build_object(
    'id', c.id,
    'nome', c.nome,
    'cep', c.cep,
    'endereco', c.endereco,
    'numero', c.numero,
    'complemento', c.complemento,
    'bairro', c.bairro,
    'cidade', c.cidade,
    'estado', c.estado,
    'quantidade_unidades', c.quantidade_unidades,
    'ativo', c.ativo,
    'observacoes', c.observacoes
  ))
  from public.condominios c
  where c.id = '${id}'::uuid
)::text, '[]');
`
  }

  const condominio = idEq(params, 'condominio_id')
  if (!condominio) return null
  if (tabela === 'sindicos') {
    if (params.get('select') !== SELECT_SINDICO || params.get('order') !== 'ativo.desc,data_inicio.desc') return null
    if (chaves.some((chave) => !['select', 'condominio_id', 'order'].includes(chave))) return null
    return `${GUARDA}
select coalesce((
  select json_agg(item.linha order by item.ativo desc, item.data_inicio desc)
  from (
    select s.ativo, s.data_inicio, json_build_object(
      'id', s.id,
      'nome', s.nome,
      'whatsapp', s.whatsapp,
      'email', s.email,
      'data_inicio', s.data_inicio,
      'data_fim', s.data_fim,
      'ativo', s.ativo
    ) as linha
    from public.sindicos s
    where s.condominio_id = '${condominio}'::uuid
  ) item
)::text, '[]');
`
  }
  if (tabela === 'destinatarios_comprovante') {
    if (params.get('select') !== SELECT_DESTINATARIO || params.get('order') !== 'ativo.desc,data_inicio.desc') return null
    if (chaves.some((chave) => !['select', 'condominio_id', 'order'].includes(chave))) return null
    return `${GUARDA}
select coalesce((
  select json_agg(item.linha order by item.ativo desc, item.data_inicio desc)
  from (
    select d.ativo, d.data_inicio, json_build_object(
      'id', d.id,
      'papel', d.papel,
      'complemento', d.complemento,
      'nome', d.nome,
      'whatsapp', d.whatsapp,
      'email', d.email,
      'data_inicio', d.data_inicio,
      'data_fim', d.data_fim,
      'ativo', d.ativo
    ) as linha
    from public.destinatarios_comprovante d
    where d.condominio_id = '${condominio}'::uuid
  ) item
)::text, '[]');
`
  }
  if (tabela === 'contratos') {
    if (params.get('select') !== SELECT_CONTRATO || params.get('order') !== 'created_at.desc') return null
    if (chaves.some((chave) => !['select', 'condominio_id', 'order'].includes(chave))) return null
    return `${GUARDA}
select coalesce((
  select json_agg(item.linha order by item.created_at desc)
  from (
    select ct.created_at, json_build_object(
      'id', ct.id,
      'numero_contrato', ct.numero_contrato,
      'quantidade_visitas', ct.quantidade_visitas,
      'data_inicio_manutencao', ct.data_inicio_manutencao,
      'status', ct.status
    ) as linha
    from public.contratos ct
    where ct.condominio_id = '${condominio}'::uuid
  ) item
)::text, '[]');
`
  }
  return null
}

function jwtLab(segundos, uso) {
  const cabecalho = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const agora = Math.floor(Date.now() / 1000)
  const corpo = Buffer.from(JSON.stringify({
    aud: 'authenticated',
    exp: agora + segundos,
    iat: agora,
    sub: ADMIN_ID,
    role: 'authenticated',
    email: EMAIL_LAB,
    uso,
  })).toString('base64url')
  const assinatura = createHmac('sha256', CHAVE).update(`${cabecalho}.${corpo}`).digest('base64url')
  return `${cabecalho}.${corpo}.${assinatura}`
}

function lerJwt(token, uso) {
  const partes = String(token ?? '').split('.')
  if (partes.length !== 3) return null
  const esperada = createHmac('sha256', CHAVE).update(`${partes[0]}.${partes[1]}`).digest('base64url')
  const atual = Buffer.from(partes[2])
  const correta = Buffer.from(esperada)
  if (atual.length !== correta.length || !timingSafeEqual(atual, correta)) return null
  try {
    const dados = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))
    if (dados.sub !== ADMIN_ID || dados.uso !== uso || dados.exp < Math.floor(Date.now() / 1000)) return null
    return dados
  } catch {
    return null
  }
}

function usuarioLab() {
  return {
    id: ADMIN_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: EMAIL_LAB,
    app_metadata: { provider: 'email', providers: ['email'], perfil: 'admin' },
    user_metadata: { nome: 'ADM Laboratório' },
    created_at: '2026-10-26T00:00:00.000Z',
  }
}

function sessaoLab() {
  return {
    access_token: jwtLab(60 * 60 * 2, 'acesso'),
    token_type: 'bearer',
    expires_in: 60 * 60 * 2,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 2,
    refresh_token: jwtLab(60 * 60 * 12, 'renovar'),
    user: usuarioLab(),
  }
}

function cabecalho(pedido, nome) {
  const valor = pedido.headers[nome]
  return Array.isArray(valor) ? valor[0] ?? '' : valor ?? ''
}

function autorizacao(pedido) {
  const valor = cabecalho(pedido, 'authorization')
  return valor.startsWith('Bearer ') ? valor.slice(7) : ''
}

function recusarAmbienteExterno() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (url && url !== `http://${HOST}:${PORTA}`) {
    console.error('Ambiente recusado: o endereço do Supabase não é o laboratório local.')
    process.exit(1)
  }
  if (process.env.DATABASE_URL) {
    console.error('Ambiente recusado: DATABASE_URL não é usado pelo laboratório.')
    process.exit(1)
  }
  if (process.env.PGHOST && process.env.PGHOST !== HOST) {
    console.error('Ambiente recusado: PGHOST não é 127.0.0.1.')
    process.exit(1)
  }
  if (process.env.PGPORT && process.env.PGPORT !== '5432') {
    console.error('Ambiente recusado: a porta do PostgreSQL não é 5432.')
    process.exit(1)
  }
  if (process.env.PGDATABASE && process.env.PGDATABASE !== BANCO) {
    console.error('Ambiente recusado: o banco não é eleva_manutencao_teste.')
    process.exit(1)
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY !== CHAVE) {
    console.error('Ambiente recusado: a chave recebida não é a chave fictícia do laboratório.')
    process.exit(1)
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== ANON) {
    console.error('Ambiente recusado: a chave anônima não é a chave fictícia do laboratório.')
    process.exit(1)
  }
  if (process.env.APP_PUBLIC_ORIGIN && process.env.APP_PUBLIC_ORIGIN !== 'https://manutencao.eleva.example') {
    console.error('Ambiente recusado: a origem pública não é a do laboratório.')
    process.exit(1)
  }
}

function ambientePsql(token, caminho, texto = '') {
  return {
    SYSTEMROOT: process.env.SYSTEMROOT ?? 'C:\\Windows',
    WINDIR: process.env.WINDIR ?? 'C:\\Windows',
    PATH: process.env.PATH ?? '',
    PATHEXT: process.env.PATHEXT ?? '.EXE',
    TEMP: process.env.TEMP ?? '',
    TMP: process.env.TMP ?? '',
    PGCLIENTENCODING: 'UTF8',
    PGCONNECT_TIMEOUT: '5',
    LAB_TOKEN: token,
    LAB_CAMINHO: caminho,
    LAB_TEXTO: texto,
  }
}

const GUARDA = String.raw`
\set ON_ERROR_STOP on
\set HISTFILE
\pset pager off
\pset tuples_only on
\pset format unaligned
\pset footer off
\getenv lab_token LAB_TOKEN
\getenv lab_caminho LAB_CAMINHO
\getenv lab_texto LAB_TEXTO
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

const CONSULTAS = {
  ler: `${GUARDA}
select coalesce(public.ler_link_confirmacao_sindico(:'lab_token')::text, 'null');
`,
  registrar: `${GUARDA}
select public.registrar_confirmacao_sindico(:'lab_token')::text;
`,
  pdf: `${GUARDA}
select case
  when exists (
    select 1
    from public.manutencoes m
    join public.links_confirmacao_sindico l
      on l.manutencao_id = m.id
     and l.revogado_em is null
    where m.id::text like '1ab00000-0000-4000-8000-%'
      and m.pdf_url = :'lab_caminho'
      and lower(m.id::text) || '/comprovante.pdf' = :'lab_caminho'
  ) then 'sim'
  else 'nao'
end;
`,
  saude: `${GUARDA}
select json_build_object(
  'banco', current_database(),
  'endereco', host(inet_server_addr()),
  'porta', inet_server_port()
)::text;
`,
  ficha: `${GUARDA}
select json_build_object(
  'id', m.id,
  'tipo', m.tipo,
  'numero_visita', m.numero_visita,
  'data_programada_original', m.data_programada_original,
  'data_programada_atual', m.data_programada_atual,
  'data_realizada', m.data_realizada,
  'registro_anterior', m.registro_anterior,
  'status', m.status,
  'pdf_url', m.pdf_url,
  'observacao_administracao', m.observacao_administracao,
  'contrato_id', m.contrato_id,
  'condominios', json_build_object('nome', c.nome),
  'prestadores', json_build_object('nome', p.nome),
  'contratos', null,
  'itens_manutencao', (
    select coalesce(json_agg(json_build_object(
      'nome_identificacao', i.nome_identificacao,
      'resultado', i.resultado,
      'ocorrencias', null
    )), '[]'::json)
    from public.itens_manutencao i
    where i.manutencao_id = m.id
  )
)::text
from public.manutencoes m
join public.condominios c on c.id = m.condominio_id
join public.prestadores p on p.id = m.prestador_id
where m.id = '${VISITA_WHATSAPP}';
`,
  documento: `${GUARDA}
select case
  when exists (
    select 1
    from public.documentos_confirmacao d
    where d.manutencao_id = '${VISITA_WHATSAPP}'::uuid
      and d.caminho = :'lab_caminho'
      and d.caminho = lower(d.manutencao_id::text) || '/confirmacoes/' || d.codigo || '.pdf'
      and position('comprovante.pdf' in d.caminho) = 0
      and d.codigo ~ '^CM-[0-9]{4}-[0-9]{6}(-D)?$'
  ) then 'sim'
  else 'nao'
end;
`,
}

function consultar(nome, token = '', caminho = '', sqlDireto = '', texto = '') {
  const sql = sqlDireto || CONSULTAS[nome]
  if (!sql) return Promise.reject(new Error('consulta recusada'))
  return new Promise((resolve, reject) => {
    const filho = spawn(PSQL, [
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      HOST,
      '-p',
      '5432',
      '-U',
      'postgres',
      '-d',
      BANCO,
      '-f',
      '-',
    ], {
      shell: false,
      windowsHide: true,
      env: ambientePsql(token, caminho, texto),
    })
    let saida = ''
    let erro = ''
    const timer = setTimeout(() => {
      filho.kill()
      reject(new Error('consulta excedeu o tempo'))
    }, 8000)
    filho.stdout.setEncoding('utf8')
    filho.stderr.setEncoding('utf8')
    filho.stdout.on('data', (pedaco) => {
      saida += pedaco
    })
    filho.stderr.on('data', (pedaco) => {
      erro += pedaco
    })
    filho.on('error', (falha) => {
      clearTimeout(timer)
      reject(falha)
    })
    filho.on('close', (codigo) => {
      clearTimeout(timer)
      if (codigo !== 0) {
        const texto = erro.replace(/^ERROR:\s*/m, '').split('\n').map((linha) => linha.trim()).find((linha) => linha && !linha.startsWith('CONTEXTO') && !linha.startsWith('CONTEXT')) ?? 'consulta recusada'
        reject(new Error(texto.slice(0, 240)))
        return
      }
      const linhas = saida.split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean)
      resolve(linhas.at(-1) ?? '')
    })
    filho.stdin.end(sql)
  })
}

function chaveAceita(pedido) {
  const autorizacao = pedido.headers.authorization ?? ''
  const apikey = pedido.headers.apikey ?? ''
  return autorizacao === `Bearer ${CHAVE}` && apikey === CHAVE
}

function enviar(resposta, status, corpo, tipo) {
  resposta.writeHead(status, {
    'Content-Type': tipo,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  resposta.end(corpo)
}

function erroRpc(resposta, falha) {
  const mensagem = String(falha.message ?? 'consulta recusada').replace(TOKEN, '[token]')
  enviar(resposta, 400, JSON.stringify({ message: mensagem, code: 'P0001', details: null, hint: null }), 'application/json; charset=utf-8')
}

async function lerCorpo(pedido, limite = 4096) {
  const pedacos = []
  let tamanho = 0
  for await (const pedaco of pedido) {
    tamanho += pedaco.length
    if (tamanho > limite) throw new Error('corpo grande')
    pedacos.push(pedaco)
  }
  return Buffer.concat(pedacos)
}

function chavesExatas(bruto, esperadas) {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return false
  const chaves = Object.keys(bruto)
  return chaves.length === esperadas.length && esperadas.every((chave) => chaves.includes(chave))
}

function caminhoConfirmacao(pathname) {
  const pedidoPdf = new RegExp(`^/storage/v1/object/pdfs/(${VISITA_WHATSAPP}/confirmacoes/(CM-[0-9]{4}-[0-9]{6}(?:-D)?)\\.pdf)$`)
  const encontrado = pedidoPdf.exec(pathname)
  if (!encontrado) return null
  const logico = encontrado[1]
  const codigo = encontrado[2]
  if (logico.includes('comprovante.pdf') || logico.includes('..') || logico.includes('\\') || !CODIGO_DOCUMENTO.test(codigo)) return null
  const arquivo = path.resolve(PASTA_CONFIRMACAO, `${codigo}.pdf`)
  if (path.dirname(arquivo) !== path.resolve(PASTA_CONFIRMACAO)) return null
  return { logico, codigo, arquivo }
}

async function sqlConfirmacaoManual(funcao, bruto) {
  const admin = bruto?.p_admin
  const visita = typeof bruto?.p_manutencao_id === 'string' ? bruto.p_manutencao_id.toLowerCase() : ''
  if (admin !== ADMIN_ID || visita !== VISITA_WHATSAPP) return { status: 404 }
  if (funcao === 'resumo_confirmacao_comprovante' && chavesExatas(bruto, ['p_admin', 'p_manutencao_id'])) {
    return {
      sql: `select public.resumo_confirmacao_comprovante('${ADMIN_ID}'::uuid, '${VISITA_WHATSAPP}'::uuid)::text;`,
    }
  }
  if (funcao === 'registrar_confirmacao_manual' && chavesExatas(bruto, ['p_admin', 'p_manutencao_id', 'p_justificativa']) && typeof bruto.p_justificativa === 'string' && bruto.p_justificativa.length <= 400 && !bruto.p_justificativa.includes('\u0000')) {
    return {
      sql: `select to_json(public.registrar_confirmacao_manual('${ADMIN_ID}'::uuid, '${VISITA_WHATSAPP}'::uuid, convert_from(decode(:'lab_texto', 'base64'), 'UTF8')))::text;`,
      texto: Buffer.from(bruto.p_justificativa, 'utf8').toString('base64'),
    }
  }
  if (funcao === 'corrigir_confirmacao_manual' && chavesExatas(bruto, ['p_admin', 'p_manutencao_id', 'p_registro_id', 'p_justificativa']) && UUID.test(bruto.p_registro_id ?? '') && typeof bruto.p_justificativa === 'string' && bruto.p_justificativa.length <= 400 && !bruto.p_justificativa.includes('\u0000')) {
    const registro = bruto.p_registro_id.toLowerCase()
    return {
      sql: `select to_json(public.corrigir_confirmacao_manual('${ADMIN_ID}'::uuid, '${VISITA_WHATSAPP}'::uuid, '${registro}'::uuid, convert_from(decode(:'lab_texto', 'base64'), 'UTF8')))::text;`,
      texto: Buffer.from(bruto.p_justificativa, 'utf8').toString('base64'),
    }
  }
  if (funcao === 'garantir_documento_confirmacao' && chavesExatas(bruto, ['p_admin', 'p_manutencao_id', 'p_tipo', 'p_alvo'])) {
    const tipo = bruto.p_tipo
    if (tipo === 'link' && bruto.p_alvo == null) {
      return {
        sql: `select public.garantir_documento_confirmacao('${ADMIN_ID}'::uuid, '${VISITA_WHATSAPP}'::uuid, 'link', null::uuid)::text;`,
      }
    }
    if ((tipo === 'registro' || tipo === 'declaracao') && UUID.test(bruto.p_alvo ?? '')) {
      const alvo = bruto.p_alvo.toLowerCase()
      return {
        sql: `select public.garantir_documento_confirmacao('${ADMIN_ID}'::uuid, '${VISITA_WHATSAPP}'::uuid, '${tipo}', '${alvo}'::uuid)::text;`,
      }
    }
  }
  if (funcao === 'ler_documento_confirmacao' && chavesExatas(bruto, ['p_admin', 'p_manutencao_id', 'p_codigo']) && CODIGO_DOCUMENTO.test(bruto.p_codigo ?? '')) {
    return {
      sql: `select coalesce(public.ler_documento_confirmacao('${ADMIN_ID}'::uuid, '${VISITA_WHATSAPP}'::uuid, '${bruto.p_codigo}')::text, 'null');`,
    }
  }
  return { status: 400 }
}

recusarAmbienteExterno()

const pdf = await readFile(PDF_FIXO)
if (pdf.length < 5 || pdf.subarray(0, 4).toString('ascii') !== '%PDF') {
  console.error('Ambiente recusado: o PDF fictício do laboratório não está disponível.')
  process.exit(1)
}

const servidor = createServer(async (pedido, resposta) => {
  const remoto = pedido.socket.remoteAddress
  if (remoto !== HOST && remoto !== '::ffff:127.0.0.1') {
    pedido.destroy()
    return
  }

  let caminho
  try {
    caminho = new URL(pedido.url ?? '/', `http://${HOST}:${PORTA}`)
  } catch {
    enviar(resposta, 400, 'pedido recusado', 'text/plain; charset=utf-8')
    return
  }

  try {
    if (pedido.method === 'GET' && caminho.pathname === '/auth/v1/user') {
      if (!lerJwt(autorizacao(pedido), 'acesso')) {
        console.log('GET auth 401')
        enviar(resposta, 401, JSON.stringify({ message: 'sem sessao' }), 'application/json; charset=utf-8')
        return
      }
      console.log('GET auth 200')
      enviar(resposta, 200, JSON.stringify(usuarioLab()), 'application/json; charset=utf-8')
      return
    }

    if (pedido.method === 'POST' && caminho.pathname === '/auth/v1/logout') {
      console.log('POST logout 204')
      resposta.writeHead(204)
      resposta.end()
      return
    }

    if (pedido.method === 'POST' && caminho.pathname === '/auth/v1/token' && cabecalho(pedido, 'apikey') === ANON) {
      const bruto = JSON.parse((await lerCorpo(pedido)).toString('utf8'))
      const tipo = caminho.searchParams.get('grant_type')
      if (tipo === 'password' && bruto?.email === EMAIL_LAB && bruto?.password === SENHA_LAB) {
        console.log('POST login 200')
        enviar(resposta, 200, JSON.stringify(sessaoLab()), 'application/json; charset=utf-8')
        return
      }
      if (tipo === 'refresh_token' && lerJwt(bruto?.refresh_token, 'renovar')) {
        console.log('POST renovar 200')
        enviar(resposta, 200, JSON.stringify(sessaoLab()), 'application/json; charset=utf-8')
        return
      }
      console.log('POST login 400')
      enviar(resposta, 400, JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }), 'application/json; charset=utf-8')
      return
    }

    if (pedido.method === 'GET' && caminho.pathname.startsWith('/rest/v1/') && cabecalho(pedido, 'apikey') === ANON && lerJwt(autorizacao(pedido), 'acesso')) {
      const tabela = caminho.pathname.slice('/rest/v1/'.length)
      const objeto = cabecalho(pedido, 'accept').includes('vnd.pgrst.object')
      if (tabela === 'usuarios' && caminho.searchParams.get('id') === `eq.${ADMIN_ID}`) {
        const linha = { nome: 'ADM Laboratório', perfil: 'admin', ativo: true, email: EMAIL_LAB }
        console.log('GET usuarios 200')
        enviar(resposta, 200, JSON.stringify(objeto ? linha : [linha]), 'application/json; charset=utf-8')
        return
      }
      if (tabela === 'manutencoes' && caminho.searchParams.get('id') === `eq.${VISITA_WHATSAPP}`) {
        const ficha = await consultar('ficha')
        if (!ficha) {
          console.log('GET manutencao 406')
          enviar(resposta, 406, JSON.stringify({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }), 'application/json; charset=utf-8')
          return
        }
        console.log('GET manutencao 200')
        enviar(resposta, 200, objeto ? ficha : `[${ficha}]`, 'application/json; charset=utf-8')
        return
      }
      if (tabela === 'manutencoes' && !caminho.searchParams.get('id')) {
        const sql = sqlListaManutencoes(caminho.searchParams)
        if (!sql) {
          console.log('GET manutencoes lista 404')
          enviar(resposta, 404, JSON.stringify({ message: 'consulta recusada' }), 'application/json; charset=utf-8')
          return
        }
        const lista = await consultar('', '', '', sql)
        console.log('GET manutencoes lista 200')
        enviar(resposta, 200, lista || '[]', 'application/json; charset=utf-8')
        return
      }
      if (tabela === 'historico_reagendamentos' || tabela === 'prestadores') {
        console.log(`GET ${tabela} 200`)
        enviar(resposta, 200, '[]', 'application/json; charset=utf-8')
        return
      }
      if (tabela === 'condominios' || tabela === 'sindicos' || tabela === 'contratos' || tabela === 'destinatarios_comprovante') {
        const sql = sqlFichaCondominio(tabela, caminho.searchParams)
        if (!sql) {
          console.log(`GET ${tabela} 404`)
          enviar(resposta, 404, JSON.stringify({ message: 'consulta recusada' }), 'application/json; charset=utf-8')
          return
        }
        const lista = await consultar('', '', '', sql)
        console.log(`GET ${tabela} 200`)
        enviar(resposta, 200, lista || '[]', 'application/json; charset=utf-8')
        return
      }
      console.log('GET rest 404')
      enviar(resposta, 404, JSON.stringify({ message: 'consulta recusada' }), 'application/json; charset=utf-8')
      return
    }

    if (!chaveAceita(pedido)) {
      console.log(`${pedido.method} recusado 401`)
      enviar(resposta, 401, JSON.stringify({ message: 'chave recusada' }), 'application/json; charset=utf-8')
      return
    }

    if (pedido.method === 'GET' && caminho.pathname === '/laboratorio/saude') {
      const saude = JSON.parse(await consultar('saude'))
      if (saude.banco !== BANCO || saude.endereco !== HOST || Number(saude.porta) !== 5432) {
        enviar(resposta, 500, JSON.stringify({ message: 'banco recusado' }), 'application/json; charset=utf-8')
        return
      }
      console.log('GET saude 200')
      enviar(resposta, 200, JSON.stringify(saude), 'application/json; charset=utf-8')
      return
    }

    if (pedido.method === 'POST' && caminho.pathname.startsWith('/rest/v1/rpc/')) {
      const funcao = caminho.pathname.slice('/rest/v1/rpc/'.length)
      if (ACOMPANHAMENTO.has(funcao)) {
        const bruto = JSON.parse((await lerCorpo(pedido)).toString('utf8'))
        const admin = bruto?.p_admin
        const chaves = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? Object.keys(bruto) : []
        const id = typeof bruto?.p_manutencao_id === 'string' ? bruto.p_manutencao_id.toLowerCase() : ''
        const confirmacao = typeof bruto?.p_confirmacao === 'string' ? bruto.p_confirmacao.trim() : ''
        let sql = ''
        if (admin !== ADMIN_ID) {
          console.log('POST rpc acompanhamento 404')
          enviar(resposta, 404, JSON.stringify({ message: 'funcao recusada' }), 'application/json; charset=utf-8')
          return
        }
        if (funcao === 'fatos_acompanhamento_comprovantes' && chaves.length === 1 && chaves[0] === 'p_admin') {
          sql = `select public.fatos_acompanhamento_comprovantes('${ADMIN_ID}'::uuid)::text;`
        }
        if (funcao === 'ficha_acompanhamento_comprovante' && UUID.test(id) && chaves.length === 2 && chaves.includes('p_admin') && chaves.includes('p_manutencao_id')) {
          sql = `select public.ficha_acompanhamento_comprovante('${ADMIN_ID}'::uuid, '${id}'::uuid)::text;`
        }
        if (funcao === 'ativar_acompanhamento_comprovantes' && confirmacao === 'iniciar acompanhamento' && chaves.length === 2 && chaves.includes('p_admin') && chaves.includes('p_confirmacao')) {
          sql = `select public.ativar_acompanhamento_comprovantes('${ADMIN_ID}'::uuid, 'iniciar acompanhamento');`
        }
        if (funcao === 'incluir_comprovante_no_acompanhamento' && UUID.test(id) && confirmacao === 'incluir no acompanhamento' && chaves.length === 3 && chaves.includes('p_admin') && chaves.includes('p_manutencao_id') && chaves.includes('p_confirmacao')) {
          sql = `select public.incluir_comprovante_no_acompanhamento('${ADMIN_ID}'::uuid, '${id}'::uuid, 'incluir no acompanhamento');`
        }
        if (!sql) {
          console.log('POST rpc acompanhamento 400')
          enviar(resposta, 400, JSON.stringify({ message: 'pedido recusado', code: 'P0001' }), 'application/json; charset=utf-8')
          return
        }
        const resultado = await consultar('', '', '', `${GUARDA}\n${sql}`)
        console.log('POST rpc acompanhamento 200')
        enviar(resposta, 200, resultado || 'null', 'application/json; charset=utf-8')
        return
      }
      if (funcao === 'resumo_link_confirmacao_sindico' || funcao === 'resumo_envio_whatsapp' || funcao === 'ler_cifrado_para_envio' || funcao === 'registrar_comunicacao_comprovante') {
        const bruto = JSON.parse((await lerCorpo(pedido)).toString('utf8'))
        const id = bruto?.p_manutencao_id
        const admin = bruto?.p_admin ?? ADMIN_ID
        if (id !== VISITA_WHATSAPP || admin !== ADMIN_ID) {
          console.log('POST rpc envio 404')
          enviar(resposta, 404, JSON.stringify({ message: 'funcao recusada' }), 'application/json; charset=utf-8')
          return
        }
        let sql = ''
        if (funcao === 'resumo_link_confirmacao_sindico') sql = `select public.resumo_link_confirmacao_sindico('${VISITA_WHATSAPP}'::uuid)::text;`
        if (funcao === 'resumo_envio_whatsapp') sql = `select public.resumo_envio_whatsapp('${VISITA_WHATSAPP}'::uuid)::text;`
        if (funcao === 'ler_cifrado_para_envio') sql = `select public.ler_cifrado_para_envio('${VISITA_WHATSAPP}'::uuid, '${ADMIN_ID}'::uuid)::text;`
        if (funcao === 'registrar_comunicacao_comprovante') {
          const acao = bruto?.p_acao
          const referencia = bruto?.p_referencia
          if (acao !== 'confirmar' && acao !== 'correcao') {
            console.log('POST rpc envio 400')
            enviar(resposta, 400, JSON.stringify({ message: 'acao recusada' }), 'application/json; charset=utf-8')
            return
          }
          if (acao === 'correcao' && !/^[0-9a-f-]{36}$/.test(referencia ?? '')) {
            console.log('POST rpc envio 400')
            enviar(resposta, 400, JSON.stringify({ message: 'referencia recusada' }), 'application/json; charset=utf-8')
            return
          }
          const ref = acao === 'correcao' ? `'${referencia}'::uuid` : 'null'
          sql = `select public.registrar_comunicacao_comprovante('${VISITA_WHATSAPP}'::uuid, '${ADMIN_ID}'::uuid, '${acao}', ${ref})::text;`
        }
        const resultado = await consultar('', '', '', `${GUARDA}\n${sql}`)
        console.log('POST rpc envio 200')
        enviar(resposta, 200, resultado || 'null', 'application/json; charset=utf-8')
        return
      }
      if (funcao === 'biblioteca_documentos_condominio') {
        const bruto = JSON.parse((await lerCorpo(pedido)).toString('utf8'))
        const condominio = typeof bruto?.p_condominio_id === 'string' ? bruto.p_condominio_id.toLowerCase() : ''
        if (bruto?.p_admin !== ADMIN_ID || !UUID.test(condominio) || !chavesExatas(bruto, ['p_admin', 'p_condominio_id'])) {
          console.log('POST rpc biblioteca 404')
          enviar(resposta, 404, JSON.stringify({ message: 'funcao recusada' }), 'application/json; charset=utf-8')
          return
        }
        const resultado = await consultar('', '', '', `${GUARDA}
select coalesce(public.biblioteca_documentos_condominio('${ADMIN_ID}'::uuid, '${condominio}'::uuid)::text, 'null');
`)
        console.log('POST rpc biblioteca 200')
        enviar(resposta, 200, resultado || 'null', 'application/json; charset=utf-8')
        return
      }
      if (CONFIRMACAO_MANUAL.has(funcao)) {
        const bruto = JSON.parse((await lerCorpo(pedido)).toString('utf8'))
        const pedidoSql = await sqlConfirmacaoManual(funcao, bruto)
        if (!pedidoSql.sql) {
          console.log(`POST rpc confirmacao ${pedidoSql.status ?? 400}`)
          enviar(resposta, pedidoSql.status ?? 400, JSON.stringify({ message: 'pedido recusado', code: 'P0001' }), 'application/json; charset=utf-8')
          return
        }
        const resultado = await consultar('', '', '', `${GUARDA}\n${pedidoSql.sql}`, pedidoSql.texto ?? '')
        console.log('POST rpc confirmacao 200')
        enviar(resposta, 200, resultado || 'null', 'application/json; charset=utf-8')
        return
      }
      if (!ROTAS.has(funcao)) {
        console.log('POST rpc 404')
        enviar(resposta, 404, JSON.stringify({ message: 'funcao recusada' }), 'application/json; charset=utf-8')
        return
      }
      const bruto = JSON.parse((await lerCorpo(pedido)).toString('utf8'))
      const token = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto.p_token : ''
      if (typeof token !== 'string' || !TOKEN.test(token) || Object.keys(bruto).some((chave) => chave !== 'p_token')) {
        console.log(`POST rpc:${funcao === 'ler_link_confirmacao_sindico' ? 'ler' : 'registrar'} 400`)
        enviar(resposta, 400, JSON.stringify({ message: 'token recusado', code: 'P0001' }), 'application/json; charset=utf-8')
        return
      }
      const resultado = await consultar(funcao === 'ler_link_confirmacao_sindico' ? 'ler' : 'registrar', token, '')
      console.log(`POST rpc:${funcao === 'ler_link_confirmacao_sindico' ? 'ler' : 'registrar'} 200`)
      if (funcao === 'registrar_confirmacao_sindico') {
        enviar(resposta, 200, JSON.stringify(resultado), 'application/json; charset=utf-8')
        return
      }
      enviar(resposta, 200, resultado, 'application/json; charset=utf-8')
      return
    }

    if (pedido.method === 'POST' && caminho.pathname.startsWith('/storage/v1/object/pdfs/')) {
      const destino = caminhoConfirmacao(caminho.pathname)
      const upsert = String(pedido.headers['x-upsert'] ?? 'false').toLowerCase()
      if (!destino || upsert === 'true' || caminho.pathname.includes('comprovante.pdf')) {
        console.log('POST confirmacao pdf 400')
        enviar(resposta, 400, JSON.stringify({ message: 'arquivo recusado', statusCode: '400' }), 'application/json; charset=utf-8')
        return
      }
      const permitido = await consultar('documento', '', destino.logico)
      if (permitido !== 'sim') {
        console.log('POST confirmacao pdf 404')
        enviar(resposta, 404, JSON.stringify({ message: 'arquivo recusado', statusCode: '404' }), 'application/json; charset=utf-8')
        return
      }
      const bytes = await lerCorpo(pedido, 1572864)
      if (bytes.length < 5 || bytes.subarray(0, 4).toString('ascii') !== '%PDF') {
        console.log('POST confirmacao pdf 400')
        enviar(resposta, 400, JSON.stringify({ message: 'arquivo recusado', statusCode: '400' }), 'application/json; charset=utf-8')
        return
      }
      await mkdir(PASTA_CONFIRMACAO, { recursive: true })
      try {
        await writeFile(destino.arquivo, bytes, { flag: 'wx' })
      } catch (falha) {
        if (falha && falha.code === 'EEXIST') {
          console.log('POST confirmacao pdf 400')
          enviar(resposta, 400, JSON.stringify({ message: 'The resource already exists', statusCode: '409', error: 'Duplicate' }), 'application/json; charset=utf-8')
          return
        }
        throw falha
      }
      console.log('POST confirmacao pdf 200')
      enviar(resposta, 200, JSON.stringify({ Id: 'laboratorio', Key: `pdfs/${destino.logico}` }), 'application/json; charset=utf-8')
      return
    }

    if (pedido.method === 'GET' && caminho.pathname.startsWith('/storage/v1/object/')) {
      const destino = caminhoConfirmacao(caminho.pathname)
      if (destino) {
        const permitido = await consultar('documento', '', destino.logico)
        if (permitido !== 'sim') {
          console.log('GET confirmacao pdf 404')
          enviar(resposta, 404, 'comprovante indisponivel', 'text/plain; charset=utf-8')
          return
        }
        try {
          const bytes = await readFile(destino.arquivo)
          if (bytes.subarray(0, 4).toString('ascii') !== '%PDF') throw new Error('pdf recusado')
          console.log('GET confirmacao pdf 200')
          enviar(resposta, 200, bytes, 'application/pdf')
        } catch {
          console.log('GET confirmacao pdf 404')
          enviar(resposta, 404, 'comprovante indisponivel', 'text/plain; charset=utf-8')
        }
        return
      }
      const pedidoPdf = /^\/storage\/v1\/object\/pdfs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/comprovante\.pdf$/
      const encontrado = pedidoPdf.exec(caminho.pathname)
      if (!encontrado) {
        console.log('GET pdf 404')
        enviar(resposta, 404, 'comprovante indisponivel', 'text/plain; charset=utf-8')
        return
      }
      const logico = `${encontrado[1]}/comprovante.pdf`
      if (!CAMINHO_PDF.test(logico)) {
        console.log('GET pdf 404')
        enviar(resposta, 404, 'comprovante indisponivel', 'text/plain; charset=utf-8')
        return
      }
      const permitido = await consultar('pdf', '', logico)
      if (permitido !== 'sim') {
        console.log('GET pdf 404')
        enviar(resposta, 404, 'comprovante indisponivel', 'text/plain; charset=utf-8')
        return
      }
      console.log('GET pdf 200')
      enviar(resposta, 200, pdf, 'application/pdf')
      return
    }

    console.log(`${pedido.method} 404`)
    enviar(resposta, 404, 'nao encontrado', 'text/plain; charset=utf-8')
  } catch (falha) {
    if (falha instanceof SyntaxError || falha.message === 'corpo grande') {
      console.log(`${pedido.method} 400`)
      enviar(resposta, 400, JSON.stringify({ message: 'pedido recusado' }), 'application/json; charset=utf-8')
      return
    }
    console.log(`${pedido.method} 400`)
    erroRpc(resposta, falha)
  }
})

servidor.listen(PORTA, HOST, () => {
  const escuta = servidor.address()
  if (!escuta || typeof escuta === 'string' || escuta.address !== HOST || escuta.port !== PORTA) {
    console.error('Ambiente recusado: o servidor não ficou preso a 127.0.0.1.')
    process.exit(1)
  }
  console.log(`laboratorio escutando ${HOST}:${PORTA}`)
})
