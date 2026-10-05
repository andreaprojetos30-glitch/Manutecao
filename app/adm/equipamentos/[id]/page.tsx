import { alternarEquipamento, salvarEquipamento } from '@/app/adm/acoes'
import { Avisos } from '@/app/adm/componentes/Avisos'
import { BotaoSubmit } from '@/app/adm/componentes/BotaoSubmit'
import { Painel } from '@/app/adm/componentes/Painel'
import { FormEquipamento } from '@/app/adm/equipamentos/FormEquipamento'
import { lerEquipamento } from '@/lib/consultas-cadastro'

export const metadata = { title: 'Equipamento · ELEVA Manutenção' }

export default async function EquipamentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string; salvo?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const equipamento = await lerEquipamento(id)

  if (!equipamento) {
    return (
      <Painel atual="equipamentos">
        <h1>Equipamento</h1>
        <p className="vazio">Equipamento não encontrado.</p>
        <div className="acoes">
          <a className="botao botao-secundario" href="/adm/equipamentos">
            Voltar
          </a>
        </div>
      </Painel>
    )
  }

  return (
    <Painel atual="equipamentos">
      <div className="topo">
        <h1>{equipamento.nome}</h1>
        <span className={equipamento.ativo ? 'selo' : 'selo selo-inativo'}>{equipamento.ativo ? 'Ativo' : 'Inativo'}</span>
      </div>
      <Avisos erro={query.erro} salvo={query.salvo} />
      <FormEquipamento
        action={salvarEquipamento}
        cancelar="/adm/equipamentos"
        inicial={{
          id: equipamento.id,
          nome: equipamento.nome,
          categoria: equipamento.categoria,
          fabricante: equipamento.fabricante ?? '',
          modelo: equipamento.modelo ?? '',
          observacoes: equipamento.observacoes ?? '',
        }}
      />
      <form action={alternarEquipamento}>
        <input type="hidden" name="id" value={equipamento.id} />
        <input type="hidden" name="ativo" value={equipamento.ativo ? 'false' : 'true'} />
        <div className="acoes">
          <BotaoSubmit secundario>{equipamento.ativo ? 'Inativar' : 'Reativar'}</BotaoSubmit>
        </div>
      </form>
    </Painel>
  )
}
