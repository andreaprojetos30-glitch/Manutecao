'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { registrarOcorrencia, type EstadoOcorrencia } from '@/app/prestador/acoes'

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
  const [estado, acao] = useActionState(registrarOcorrencia, inicial)
  const [descricao, setDescricao] = useState(descricaoInicial)
  const [resolvida, setResolvida] = useState(resolvidaInicial)
  const [preview, setPreview] = useState<string | null>(null)

  return (
    <form action={acao}>
      <input type="hidden" name="manutencao_id" value={manutencaoId} />
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="foto_atual" value={fotoAtual} />
      <p className="subtitulo">{nome}</p>
      {estado.erro ? (
        <p className="aviso" role="alert">
          {estado.erro}
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
        Foto
        <input
          name="foto"
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
        <BotaoSubmit pendenteTexto="Salvando…">Salvar ocorrência</BotaoSubmit>
        <a className="botao botao-secundario" href={voltar}>
          Cancelar
        </a>
      </div>
    </form>
  )
}
