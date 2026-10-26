// Servidor mínimo do laboratório. Escuta só em 127.0.0.1.
// Não lê .env.local e não usa endereço externo como alternativa.

import { spawn } from 'node:child_process'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
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
const TOKEN = /^[A-Za-z0-9_-]{43}$/
const CAMINHO_PDF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/comprovante\.pdf$/
const ROTAS = new Set(['ler_link_confirmacao_sindico', 'registrar_confirmacao_sindico'])

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

function ambientePsql(token, caminho) {
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
}

function consultar(nome, token = '', caminho = '', sqlDireto = '') {
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
      env: ambientePsql(token, caminho),
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

async function lerCorpo(pedido) {
  const pedacos = []
  let tamanho = 0
  for await (const pedaco of pedido) {
    tamanho += pedaco.length
    if (tamanho > 4096) throw new Error('corpo grande')
    pedacos.push(pedaco)
  }
  return Buffer.concat(pedacos).toString('utf8')
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
      const bruto = JSON.parse(await lerCorpo(pedido))
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
      if (tabela === 'historico_reagendamentos' || tabela === 'prestadores') {
        console.log(`GET ${tabela} 200`)
        enviar(resposta, 200, '[]', 'application/json; charset=utf-8')
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
      if (funcao === 'resumo_link_confirmacao_sindico' || funcao === 'resumo_envio_whatsapp' || funcao === 'ler_cifrado_para_envio' || funcao === 'registrar_comunicacao_comprovante') {
        const bruto = JSON.parse(await lerCorpo(pedido))
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
      if (!ROTAS.has(funcao)) {
        console.log('POST rpc 404')
        enviar(resposta, 404, JSON.stringify({ message: 'funcao recusada' }), 'application/json; charset=utf-8')
        return
      }
      const bruto = JSON.parse(await lerCorpo(pedido))
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

    if (pedido.method === 'GET' && caminho.pathname.startsWith('/storage/v1/object/')) {
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
