import { mkdir, writeFile } from 'node:fs/promises'
import { prepararComprovante, type VisitaParaComprovante } from '../lib/comprovante.ts'
import { carregarRecursosComprovante, gerarPdfComprovante } from '../lib/comprovante-pdf.ts'

// Exemplo local, com dados inventados. Não lê o banco e não envia arquivo.

const base: VisitaParaComprovante = {
  tipo: 'preventiva',
  numeroVisita: 2,
  quantidadeVisitas: 12,
  registroAnterior: false,
  status: 'realizada',
  condominio: 'Condomínio Açores de São José',
  dataEfetiva: '2026-03-18',
  prestador: 'Helena Duarte',
  equipamentos: [
    { nome: 'Elíptico' },
    { nome: 'Bicicleta horizontal' },
    { nome: 'Esteira' },
    { nome: 'Crossover' },
  ],
}

const nomesLongos = Array.from({ length: 48 }, (_, indice) => ({
  nome: `Equipamento de exemplo ${String(indice + 1).padStart(2, '0')}`,
}))
nomesLongos[10] = {
  nome: 'Aparelho de musculação com identificação complementar muito longa para conferir a quebra de linha sem perder acentos: ação, coração e manutenção',
}

const exemplos: Array<{ arquivo: string; visita: VisitaParaComprovante }> = [
  { arquivo: 'tmp/comprovante-visita.pdf', visita: base },
  {
    arquivo: 'tmp/comprovante-avulsa.pdf',
    visita: { ...base, tipo: 'avulsa', numeroVisita: null, quantidadeVisitas: null },
  },
  {
    arquivo: 'tmp/comprovante-corretiva.pdf',
    visita: { ...base, tipo: 'corretiva', numeroVisita: null, quantidadeVisitas: null },
  },
  {
    arquivo: 'tmp/comprovante-retorno.pdf',
    visita: { ...base, tipo: 'corretiva_complementar', numeroVisita: null, quantidadeVisitas: null },
  },
  {
    arquivo: 'tmp/comprovante-longo.pdf',
    visita: {
      ...base,
      condominio: 'Residencial Parque das Acácias com nome complementar de exemplo para ocupar mais de uma linha',
      prestador: 'João Carlos de Albuquerque e Sá',
      equipamentos: nomesLongos,
    },
  },
]

async function main() {
  const recursos = await carregarRecursosComprovante()
  await mkdir('tmp', { recursive: true })

  for (const exemplo of exemplos) {
    const preparado = prepararComprovante(exemplo.visita)
    if (!preparado.comprovante) throw new Error(preparado.erro ?? 'O comprovante não pôde ser gerado.')
    const gerado = await gerarPdfComprovante(preparado.comprovante, recursos)
    if (!gerado.pdf) throw new Error(gerado.erro ?? 'O comprovante não pôde ser gerado.')
    await writeFile(exemplo.arquivo, gerado.pdf)
    console.log(`${exemplo.arquivo} — ${preparado.comprovante.titulo}`)
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : 'O comprovante não pôde ser gerado.')
  process.exitCode = 1
})
