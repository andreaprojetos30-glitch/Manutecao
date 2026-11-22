'use client'

import { useActionState, useRef, useState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { buscarPessoasSindico, type EstadoForm } from '@/app/adm/acoes'
import type { SugestaoPessoaSindico } from '@/lib/cadastros'

export function FormSindicoNovo({
  action,
  condominioId,
  dataInicio,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>
  condominioId: string
  dataInicio: string
}) {
  const [estado, acao] = useActionState(action, { erro: '' })
  const [escolhida, setEscolhida] = useState<SugestaoPessoaSindico | null>(null)
  const [sugestoes, setSugestoes] = useState<SugestaoPessoaSindico[]>([])
  const espera = useRef<number | null>(null)

  function valorCampo(form: HTMLFormElement | null, campo: string) {
    const elemento = form?.elements.namedItem(campo)
    return elemento instanceof HTMLInputElement ? elemento.value : ''
  }

  function procurar(nome: string, whatsapp: string) {
    if (escolhida) return
    if (espera.current) window.clearTimeout(espera.current)
    espera.current = window.setTimeout(async () => {
      const lista = await buscarPessoasSindico(`${nome} ${whatsapp}`)
      setSugestoes(lista)
    }, 300)
  }

  function escolher(pessoa: SugestaoPessoaSindico) {
    setEscolhida(pessoa)
    setSugestoes([])
  }

  function limparEscolha() {
    setEscolhida(null)
    setSugestoes([])
  }

  return (
    <form action={acao}>
      <input type="hidden" name="condominio_id" value={condominioId} />
      {escolhida ? <input type="hidden" name="pessoa_id" value={escolhida.id} /> : null}
      {estado.erro ? (
        <p className="aviso" role="alert">
          {estado.erro}
        </p>
      ) : null}
      <p className="nota">A busca só sugere. O vínculo acontece quando você escolhe a pessoa.</p>
      {escolhida ? (
        <dl className="ficha">
          <div>
            <dt>Pessoa escolhida</dt>
            <dd>
              <strong>{escolhida.nome}</strong>
              {escolhida.whatsapp ? ` · ${escolhida.whatsapp}` : ''}
              {escolhida.email ? ` · ${escolhida.email}` : ''}
            </dd>
          </div>
          <div>
            <dt>Ativos</dt>
            <dd>{escolhida.ativos.length > 0 ? escolhida.ativos.join(', ') : 'Nenhum condomínio ativo.'}</dd>
          </div>
          <div>
            <dt>Histórico</dt>
            <dd>{escolhida.historico.length > 0 ? escolhida.historico.join(', ') : 'Sem histórico.'}</dd>
          </div>
        </dl>
      ) : (
        <div className="grade">
          <label className="largo">
            Nome
            <input
              name="nome"
              required
              autoComplete="name"
              onChange={(evento) =>
                procurar(evento.target.value, valorCampo(evento.target.form, 'whatsapp'))
              }
            />
          </label>
          <label>
            WhatsApp
            <input
              name="whatsapp"
              inputMode="tel"
              autoComplete="tel"
              onChange={(evento) => procurar(valorCampo(evento.target.form, 'nome'), evento.target.value)}
            />
          </label>
          <label>
            E-mail
            <input name="email" type="email" autoComplete="email" />
          </label>
        </div>
      )}
      {escolhida ? (
        <div className="acoes">
          <button className="botao-secundario" type="button" onClick={limparEscolha}>
            Cadastrar outra pessoa
          </button>
        </div>
      ) : null}
      {sugestoes.length > 0 ? (
        <ul className="sugestoes">
          {sugestoes.map((pessoa) => (
            <li key={pessoa.id}>
              <button type="button" className="botao-secundario" onClick={() => escolher(pessoa)}>
                <strong>{pessoa.nome}</strong>
                <span>
                  {pessoa.whatsapp || 'Sem WhatsApp'}
                  {pessoa.ativos.length > 0 ? ` · Ativos: ${pessoa.ativos.join(', ')}` : ''}
                  {pessoa.historico.length > 0 ? ` · Histórico: ${pessoa.historico.join(', ')}` : ''}
                </span>
                Usar esta pessoa
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grade">
        <label>
          Data de início
          <input name="data_inicio" type="date" required defaultValue={dataInicio} />
        </label>
      </div>
      <div className="acoes">
        <BotaoSubmit>{escolhida ? 'Vincular síndico' : 'Registrar síndico'}</BotaoSubmit>
      </div>
    </form>
  )
}

export function FormSindicoCorrecao({
  action,
  inicial,
  cancelar,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>
  inicial: {
    id: string
    condominioId: string
    nome: string
    whatsapp: string
    email: string
    dataInicio: string
    dataFim: string
    ativo: boolean
    periodo: string
  }
  cancelar: string
}) {
  const [estado, acao] = useActionState(action, { erro: '' })

  return (
    <form action={acao}>
      <input type="hidden" name="id" value={inicial.id} />
      <input type="hidden" name="condominio_id" value={inicial.condominioId} />
      {estado.erro ? (
        <p className="aviso" role="alert">
          {estado.erro}
        </p>
      ) : null}
      <div className="grade">
        <label className="largo">
          Nome
          <input name="nome" required defaultValue={inicial.nome} autoComplete="name" />
        </label>
        <label>
          WhatsApp
          <input name="whatsapp" defaultValue={inicial.whatsapp} inputMode="tel" autoComplete="tel" />
        </label>
        <label>
          E-mail
          <input name="email" type="email" defaultValue={inicial.email} autoComplete="email" />
        </label>
        {inicial.ativo ? (
          <label>
            Data de início
            <input name="data_inicio" type="date" required defaultValue={inicial.dataInicio} />
          </label>
        ) : (
          <p className="nota largo">
            Período encerrado: {inicial.periodo}. A correção altera só este registro. A pessoa e os outros condomínios
            permanecem como estão.
          </p>
        )}
      </div>
      {inicial.ativo ? (
        <p className="nota">
          Salvar a correção atualiza o contato desta pessoa nos condomínios em que ela está ativa. Os períodos
          encerrados permanecem com o contato da época.
        </p>
      ) : null}
      <div className="acoes">
        <BotaoSubmit>Salvar correção</BotaoSubmit>
        <a className="botao botao-secundario" href={cancelar}>
          Cancelar
        </a>
      </div>
    </form>
  )
}
