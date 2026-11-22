'use client'

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { autorizarEnvioFoto, registrarOcorrencia, type EstadoOcorrencia } from '@/app/prestador/acoes'
import { validarFoto } from '@/lib/execucao'
import { enviarFotoDireta, ERRO_FOTO_NAO_ENVIADA, tipoConteudoFoto } from '@/lib/fotos'
import { createClient } from '@/lib/supabase/client'

const inicial: EstadoOcorrencia = { erro: '' }

export function FormOcorrencia({
  manutencaoId,
  itemId,
  nome,
  descricaoInicial,
  resolvidaInicial,
  fotoAtual,
  fotoUrl,
  voltar,
}: {
  manutencaoId: string
  itemId: string
  nome: string
  descricaoInicial: string
  resolvidaInicial: 'sim' | 'nao' | ''
  fotoAtual: string
  fotoUrl: string | null
  voltar: string
}) {
  const [estado, acao, pendente] = useActionState(registrarOcorrencia, inicial)
  const [descricao, setDescricao] = useState(descricaoInicial)
  const [resolvida, setResolvida] = useState(resolvidaInicial)
  const [preview, setPreview] = useState<string | null>(null)
  const [erroLocal, setErroLocal] = useState('')
  const [enviando, setEnviando] = useState(false)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const fotoEnviadaRef = useRef<HTMLInputElement>(null)
  const bloqueio = useRef(false)
  const pendenteAnterior = useRef(false)
  const erro = erroLocal || estado.erro

  useEffect(() => {
    if (pendenteAnterior.current && !pendente) bloqueio.current = false
    pendenteAnterior.current = pendente
  }, [pendente])

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (bloqueio.current || pendente) return
    const formulario = evento.currentTarget
    bloqueio.current = true
    setEnviando(true)
    setErroLocal('')
    if (fotoEnviadaRef.current) fotoEnviadaRef.current.value = ''

    const arquivo = arquivoRef.current?.files?.[0] ?? null
    let caminho = ''
    try {
      if (arquivo && arquivo.size > 0) {
        const erroFoto = validarFoto({ size: arquivo.size, type: arquivo.type, name: arquivo.name }, Boolean(fotoAtual))
        if (erroFoto) {
          setErroLocal(erroFoto)
          return
        }
        const tipo = tipoConteudoFoto(arquivo.name, arquivo.type)
        if (!tipo) {
          setErroLocal('A foto precisa ser uma imagem.')
          return
        }
        const autorizacao = await autorizarEnvioFoto({
          manutencaoId,
          itemId,
          nome: arquivo.name,
          tipo: arquivo.type,
          tamanho: arquivo.size,
        })
        if (!autorizacao.envio) {
          setErroLocal(autorizacao.erro || ERRO_FOTO_NAO_ENVIADA)
          return
        }
        const enviou = await enviarFotoDireta(
          createClient().storage.from('fotos'),
          autorizacao.envio,
          arquivo,
          tipo,
        )
        if (!enviou || !fotoEnviadaRef.current) {
          setErroLocal(ERRO_FOTO_NAO_ENVIADA)
          return
        }
        caminho = autorizacao.envio.caminho
        fotoEnviadaRef.current.value = caminho
      }
    } catch {
      setErroLocal(ERRO_FOTO_NAO_ENVIADA)
      return
    } finally {
      if (!caminho && arquivo && arquivo.size > 0) {
        bloqueio.current = false
        setEnviando(false)
      }
    }

    if (fotoEnviadaRef.current) fotoEnviadaRef.current.value = caminho
    const dados = new FormData(formulario)
    dados.delete('foto')
    setEnviando(false)
    startTransition(() => {
      acao(dados)
    })
  }

  return (
    <form onSubmit={aoEnviar}>
      <input type="hidden" name="manutencao_id" value={manutencaoId} />
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="foto_atual" value={fotoAtual} />
      <input ref={fotoEnviadaRef} type="hidden" name="foto_enviada" defaultValue="" />
      <p className="subtitulo">{nome}</p>
      {erro ? (
        <p className="aviso" role="alert">
          {erro}
        </p>
      ) : null}
      <label>
        Descrição do problema
        <textarea
          name="descricao"
          required
          rows={5}
          value={descricao}
          onChange={(evento) => setDescricao(evento.target.value)}
        />
      </label>
      <fieldset className="escolha-grande">
        <legend>Resolvida no local?</legend>
        <label>
          <input
            type="radio"
            name="resolvida"
            value="sim"
            required
            checked={resolvida === 'sim'}
            onChange={() => setResolvida('sim')}
          />
          Sim
        </label>
        <label>
          <input
            type="radio"
            name="resolvida"
            value="nao"
            checked={resolvida === 'nao'}
            onChange={() => setResolvida('nao')}
          />
          Não
        </label>
      </fieldset>
      <label>
        Foto (opcional)
        <input
          ref={arquivoRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0]
            setPreview(arquivo ? URL.createObjectURL(arquivo) : null)
          }}
        />
      </label>
      {preview ? <img className="foto-previa" src={preview} alt="Prévia da foto selecionada" /> : null}
      {!preview && fotoUrl ? <img className="foto-previa" src={fotoUrl} alt="Foto já registrada" /> : null}
      {fotoAtual && !preview ? <p className="nota">Já existe uma foto. Selecione outra somente para substituir.</p> : null}
      <div className="acoes">
        <BotaoSubmit pendenteTexto="Salvando…" ocupado={enviando || pendente}>Salvar ocorrência</BotaoSubmit>
        <a className="botao botao-secundario" href={voltar}>
          Cancelar
        </a>
      </div>
    </form>
  )
}
