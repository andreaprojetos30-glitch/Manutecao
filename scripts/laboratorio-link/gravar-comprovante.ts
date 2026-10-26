// Grava o comprovante fictício da manutenção do laboratório.
// Lê só 127.0.0.1:5432/eleva_manutencao_teste e não altera o banco.

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { prepararComprovante, type VisitaParaComprovante } from '../../lib/comprovante.ts'
import { carregarRecursosComprovante, gerarPdfComprovante } from '../../lib/comprovante-pdf.ts'

const HOST = '127.0.0.1'
const BANCO = 'eleva_manutencao_teste'
const CONDOMINIO = '1ab00000-0000-4000-8000-000000000010'
const PSQL = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe'
const DESTINO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tmp/comprovante-laboratorio.pdf')

const CONSULTA = String.raw`
\set ON_ERROR_STOP on
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
select json_build_object(
  'tipo', m.tipo,
  'numero_visita', m.numero_visita,
  'quantidade_visitas', (select ct.quantidade_visitas from public.contratos ct where ct.id = m.contrato_id),
  'registro_anterior', m.registro_anterior,
  'status', m.status,
  'condominio_id', m.condominio_id,
  'condominio', c.nome,
  'data_efetiva', m.data_realizada,
  'prestador', p.nome,
  'equipamentos', (
    select coalesce(json_agg(json_build_object('nome', i.nome_identificacao) order by i.nome_identificacao), '[]'::json)
    from public.itens_manutencao i
    where i.manutencao_id = m.id
  ),
  'observacao', m.observacao_administracao,
  'pdf_proprio', m.pdf_url = lower(m.id::text) || '/comprovante.pdf'
)::text
from public.manutencoes m
join public.condominios c on c.id = m.condominio_id
join public.prestadores p on p.id = m.prestador_id
where m.id = '1ab00000-0000-4000-8000-000000000070';
`

function consultar() {
  return new Promise<string>((resolve, reject) => {
    const filho = spawn(PSQL, [
      '-X', '-q', '-v', 'ON_ERROR_STOP=1',
      '-h', HOST, '-p', '5432', '-U', 'postgres', '-d', BANCO,
      '-f', '-',
    ], {
      shell: false,
      windowsHide: true,
      env: {
        SYSTEMROOT: process.env.SYSTEMROOT,
        WINDIR: process.env.WINDIR,
        PATH: process.env.PATH,
        PATHEXT: process.env.PATHEXT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        PGCLIENTENCODING: 'UTF8',
        PGCONNECT_TIMEOUT: '5',
      },
    })
    let saida = ''
    filho.stdout.setEncoding('utf8')
    filho.stderr.setEncoding('utf8')
    filho.stdout.on('data', (pedaco) => { saida += pedaco })
    filho.stderr.on('data', () => {})
    filho.on('error', reject)
    filho.on('close', (codigo) => {
      if (codigo !== 0) {
        reject(new Error('A leitura da manutenção do laboratório foi recusada.'))
        return
      }
      const linha = saida.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).at(-1) ?? ''
      resolve(linha)
    })
    filho.stdin.end(CONSULTA)
  })
}

function visitaDoLaboratorio(bruto: unknown): VisitaParaComprovante {
  if (!bruto || typeof bruto !== 'object') throw new Error('A manutenção do laboratório não foi encontrada.')
  const linha = bruto as Record<string, unknown>
  if (linha.condominio_id !== CONDOMINIO || linha.pdf_proprio !== true) {
    throw new Error('A manutenção lida não é a visita fictícia do laboratório.')
  }
  const equipamentos = Array.isArray(linha.equipamentos) ? linha.equipamentos : []
  return {
    tipo: String(linha.tipo ?? ''),
    numeroVisita: typeof linha.numero_visita === 'number' ? linha.numero_visita : null,
    quantidadeVisitas: typeof linha.quantidade_visitas === 'number' ? linha.quantidade_visitas : null,
    registroAnterior: linha.registro_anterior === true,
    status: String(linha.status ?? ''),
    condominio: String(linha.condominio ?? ''),
    dataEfetiva: String(linha.data_efetiva ?? '').slice(0, 10),
    prestador: String(linha.prestador ?? ''),
    equipamentos: equipamentos.map((item) => ({
      nome: item && typeof item === 'object' ? String((item as { nome?: unknown }).nome ?? '') : '',
    })),
  }
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

async function main() {
  const bruto = JSON.parse(await consultar()) as unknown
  const visita = visitaDoLaboratorio(bruto)
  const observacao = bruto && typeof bruto === 'object'
    ? (bruto as { observacao?: unknown }).observacao
    : null
  const preparado = prepararComprovante(visita, typeof observacao === 'string' ? observacao : null)
  if (!preparado.comprovante) throw new Error(preparado.erro ?? 'O comprovante não pôde ser gerado.')
  if (preparado.comprovante.titulo !== 'MANUTENÇÃO AVULSA') {
    throw new Error('O comprovante do laboratório não saiu como manutenção avulsa.')
  }
  const gerado = await gerarPdfComprovante(preparado.comprovante, await carregarRecursosComprovante())
  if (!gerado.pdf) throw new Error(gerado.erro ?? 'O comprovante não pôde ser gerado.')
  const texto = await textoDoPdf(gerado.pdf)
  const esperados = [
    preparado.comprovante.titulo,
    preparado.comprovante.condominio,
    preparado.comprovante.dataEfetiva,
    preparado.comprovante.prestador,
    ...preparado.comprovante.equipamentos,
  ]
  if (esperados.some((trecho) => !texto.includes(trecho)) || /Açores|VISITA 2\/12|18\/03\/2026/.test(texto)) {
    throw new Error('O comprovante gerado não corresponde à manutenção do laboratório.')
  }
  await mkdir(path.dirname(DESTINO), { recursive: true })
  await writeFile(DESTINO, gerado.pdf)
  console.log(`Comprovante fictício gravado para ${preparado.comprovante.titulo} em ${preparado.comprovante.dataEfetiva}.`)
}

main().catch((falha: unknown) => {
  console.error(falha instanceof Error ? falha.message : 'O comprovante não pôde ser gerado.')
  process.exitCode = 1
})
