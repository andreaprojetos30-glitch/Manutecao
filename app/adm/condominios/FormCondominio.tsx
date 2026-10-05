'use client'

import { useRef, useState } from 'react'
import { useActionState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { consultarCep, mascaraCep } from '@/lib/cep'
import { ESTADOS } from '@/lib/cadastros'
import type { EstadoForm } from '@/app/adm/acoes'

type Inicial = {
  id?: string
  nome: string
  cep: string
  endereco: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  estado: string
  quantidadeUnidades: string
  observacoes: string
}

export function FormCondominio({
  action,
  inicial,
  cancelar,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>
  inicial: Inicial
  cancelar: string
}) {
  const [estado, acao] = useActionState(action, { erro: '' })
  const [cep, setCep] = useState(inicial.cep)
  const [endereco, setEndereco] = useState(inicial.endereco)
  const [bairro, setBairro] = useState(inicial.bairro)
  const [cidade, setCidade] = useState(inicial.cidade)
  const [uf, setUf] = useState(inicial.estado)
  const [avisoCep, setAvisoCep] = useState('')
  const [consultaOk, setConsultaOk] = useState(false)
  const ultimo = useRef(inicial.cep.replace(/\D/g, ''))
  const sequencia = useRef(0)

  async function buscar(digitos: string) {
    const atual = ++sequencia.current
    setConsultaOk(false)
    setAvisoCep('Consultando CEP…')
    const resultado = await consultarCep(digitos)
    if (atual !== sequencia.current) return
    if (resultado.ok) {
      if (resultado.endereco.endereco) setEndereco(resultado.endereco.endereco)
      if (resultado.endereco.bairro) setBairro(resultado.endereco.bairro)
      if (resultado.endereco.cidade) setCidade(resultado.endereco.cidade)
      if (resultado.endereco.estado) setUf(resultado.endereco.estado)
      setConsultaOk(true)
    }
    setAvisoCep(resultado.mensagem)
  }

  function aoDigitarCep(valor: string) {
    const mascarado = mascaraCep(valor)
    setCep(mascarado)
    const digitos = mascarado.replace(/\D/g, '')
    if (digitos.length !== 8) {
      setConsultaOk(false)
      if (!digitos) setAvisoCep('')
      return
    }
    if (digitos === ultimo.current) return
    ultimo.current = digitos
    void buscar(digitos)
  }

  function aoSairCep() {
    const digitos = cep.replace(/\D/g, '')
    if (digitos.length > 0 && digitos.length < 8) {
      setConsultaOk(false)
      setAvisoCep('CEP inválido. Corrija ou apague o CEP. Preencha o endereço manualmente.')
    }
  }

  return (
    <form action={acao}>
      {inicial.id ? <input type="hidden" name="id" value={inicial.id} /> : null}
      {estado.erro ? (
        <p className="aviso" role="alert">
          {estado.erro}
        </p>
      ) : null}
      <div className="grade">
        <label className="largo">
          Nome
          <input name="nome" defaultValue={inicial.nome} required autoComplete="organization" />
        </label>
        <label>
          CEP
          <input
            name="cep"
            value={cep}
            onChange={(evento) => aoDigitarCep(evento.target.value)}
            onBlur={aoSairCep}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={9}
          />
        </label>
        <label>
          Número
          <input name="numero" defaultValue={inicial.numero} />
        </label>
        {avisoCep ? (
          <p className={consultaOk || avisoCep.startsWith('Consultando') ? 'nota largo' : 'aviso largo'} role={consultaOk || avisoCep.startsWith('Consultando') ? 'status' : 'alert'}>
            {avisoCep}
          </p>
        ) : null}
        <label className="largo">
          Endereço
          <input name="endereco" value={endereco} onChange={(evento) => setEndereco(evento.target.value)} required autoComplete="street-address" />
        </label>
        <label className="largo">
          Complemento
          <input name="complemento" defaultValue={inicial.complemento} />
        </label>
        <label>
          Bairro
          <input name="bairro" value={bairro} onChange={(evento) => setBairro(evento.target.value)} required />
        </label>
        <label>
          Cidade
          <input name="cidade" value={cidade} onChange={(evento) => setCidade(evento.target.value)} required autoComplete="address-level2" />
        </label>
        <label>
          Estado
          <select name="estado" value={uf} onChange={(evento) => setUf(evento.target.value)} required>
            <option value="">Selecione</option>
            {ESTADOS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantidade de unidades
          <input name="quantidade_unidades" defaultValue={inicial.quantidadeUnidades} inputMode="numeric" />
        </label>
        <label className="largo">
          Observações
          <textarea name="observacoes" defaultValue={inicial.observacoes} />
        </label>
      </div>
      <div className="acoes">
        <BotaoSubmit>Salvar</BotaoSubmit>
        <a className="botao botao-secundario" href={cancelar}>
          Cancelar
        </a>
      </div>
    </form>
  )
}
