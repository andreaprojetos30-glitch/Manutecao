import { ESTADOS } from '@/lib/cadastros'

export type EnderecoCep = {
  endereco: string
  bairro: string
  cidade: string
  estado: string
}

export type ResultadoCep =
  | { ok: true; endereco: EnderecoCep; mensagem: string }
  | { ok: false; mensagem: string; bloqueiaCadastro: false }

const MENSAGEM_MANUAL = 'Preencha o endereço manualmente.'

export function mascaraCep(valor: string) {
  const digitos = valor.replace(/\D/g, '').slice(0, 8)
  if (digitos.length <= 5) return digitos
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`
}

export function interpretarViaCep(corpo: unknown): EnderecoCep | null {
  if (!corpo || typeof corpo !== 'object') return null
  const dados = corpo as Record<string, unknown>
  if (dados.erro === true || dados.erro === 'true') return null

  const estado = typeof dados.uf === 'string' ? dados.uf.trim().toUpperCase() : ''
  const endereco = texto(dados.logradouro)
  const bairro = texto(dados.bairro)
  const cidade = texto(dados.localidade)
  const uf = ESTADOS.includes(estado as (typeof ESTADOS)[number]) ? estado : ''
  if (!endereco && !bairro && !cidade && !uf) return null
  return { endereco, bairro, cidade, estado: uf }
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.replace(/\s+/g, ' ').trim() : ''
}

export async function consultarCep(cep: string, buscar: typeof fetch = fetch): Promise<ResultadoCep> {
  const digitos = cep.replace(/\D/g, '')
  if (digitos.length !== 8) {
    return {
      ok: false,
      bloqueiaCadastro: false,
      mensagem: `CEP inválido. Corrija ou apague o CEP. ${MENSAGEM_MANUAL}`,
    }
  }

  try {
    const resposta = await buscar(`https://viacep.com.br/ws/${digitos}/json/`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    })
    if (!resposta.ok) {
      return {
        ok: false,
        bloqueiaCadastro: false,
        mensagem: `Não foi possível consultar o CEP. ${MENSAGEM_MANUAL}`,
      }
    }
    const endereco = interpretarViaCep(await resposta.json())
    if (!endereco) {
      return {
        ok: false,
        bloqueiaCadastro: false,
        mensagem: `CEP não encontrado. ${MENSAGEM_MANUAL}`,
      }
    }
    return {
      ok: true,
      endereco,
      mensagem: 'Endereço preenchido pelo CEP. Confira os campos e complete o número, se houver.',
    }
  } catch {
    return {
      ok: false,
      bloqueiaCadastro: false,
      mensagem: `Não foi possível consultar o CEP. ${MENSAGEM_MANUAL}`,
    }
  }
}
