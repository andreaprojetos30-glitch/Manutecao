'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { textoAlertaAgenda } from '@/lib/contratos'
import type { EstadoForm } from '@/app/adm/contratos/acoes'

type Opcao = { id: string; nome: string; ativo?: boolean }

type Inicial = {
  id?: string
  condominioId: string
  dataInicioContrato: string
  dataFimContrato: string
  dataInicioManutencao: string
  quantidadeVisitas: string
  prestadorId: string
  status: string
  bloqueado: boolean
}

export function FormContrato({
  action,
  inicial,
  cancelar,
  condominios,
  prestadores,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>
  inicial: Inicial
  cancelar: string
  condominios: Opcao[]
  prestadores: Opcao[]
}) {
  const [estado, acao] = useActionState(action, { erro: '' })
  const [inicioManutencao, setInicioManutencao] = useState(inicial.dataInicioManutencao)
  const [fim, setFim] = useState(inicial.dataFimContrato)
  const [quantidade, setQuantidade] = useState(inicial.quantidadeVisitas)
  const alerta = textoAlertaAgenda(inicioManutencao, quantidade, fim)

  return (
    <form action={acao}>
      {inicial.id ? <input type="hidden" name="id" value={inicial.id} /> : null}
      <p className="nota">Todo contrato é mensal. Manutenção avulsa é uma visita criada à parte, não um contrato.</p>
      {estado.erro ? (
        <p className="aviso" role="alert">
          {estado.erro}
        </p>
      ) : null}
      <div className="grade">
        <label className="largo">
          Condomínio
          {inicial.bloqueado ? <input type="hidden" name="condominio_id" value={inicial.condominioId} /> : null}
          <select name="condominio_id" defaultValue={inicial.condominioId} required disabled={inicial.bloqueado}>
            <option value="">Selecione</option>
            {condominios.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
                {item.ativo === false ? ' (inativo)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Início do contrato
          <input name="data_inicio_contrato" type="date" defaultValue={inicial.dataInicioContrato} required />
        </label>
        <label>
          Fim do contrato
          <input name="data_fim_contrato" type="date" value={fim} onChange={(evento) => setFim(evento.target.value)} />
        </label>
        <p className="nota largo">Opcional. Não altera a quantidade nem as datas das visitas.</p>
        <label>
          Início da manutenção
          <input
            name="data_inicio_manutencao"
            type="date"
            value={inicioManutencao}
            onChange={(evento) => setInicioManutencao(evento.target.value)}
            required
            readOnly={inicial.bloqueado}
          />
        </label>
        <label>
          Quantidade de visitas
          <input
            name="quantidade_visitas"
            value={quantidade}
            onChange={(evento) => setQuantidade(evento.target.value)}
            inputMode="numeric"
            required
            readOnly={inicial.bloqueado}
          />
        </label>
        <p className="nota largo">A programação terá exatamente esta quantidade, uma visita por mês, a partir do início da manutenção.</p>
        <label>
          Prestador padrão
          <select name="prestador_id" defaultValue={inicial.prestadorId}>
            <option value="">Sem prestador padrão</option>
            {prestadores.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
                {item.ativo === false ? ' (inativo)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Situação
          <select name="status" defaultValue={inicial.status} required>
            <option value="ativo">Ativo</option>
            <option value="encerrado">Encerrado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </label>
      </div>
      {inicial.bloqueado ? (
        <p className="nota">A programação já foi gerada. O condomínio, o início da manutenção e a quantidade de visitas permanecem. Trocar o prestador padrão não altera as visitas já criadas.</p>
      ) : (
        <p className="nota">O número do contrato é gerado ao salvar.</p>
      )}
      {alerta ? (
        <p className="alerta" role="status">
          {alerta}
        </p>
      ) : null}
      <div className="acoes">
        <BotaoSubmit>Salvar</BotaoSubmit>
        <a className="botao botao-secundario" href={cancelar}>
          Cancelar
        </a>
      </div>
    </form>
  )
}
