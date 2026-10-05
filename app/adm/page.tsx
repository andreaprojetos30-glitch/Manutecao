import { Painel } from '@/app/adm/componentes/Painel'
import { exigirDestino } from '@/lib/sessao'

export const metadata = { title: 'Área do ADM · ELEVA Manutenção' }

export default async function AdmPage() {
  const sessao = await exigirDestino('/adm')

  return (
    <Painel atual="inicio">
      <h1>Área do ADM</h1>
      <p className="subtitulo">Olá, {sessao.nome}.</p>
      <nav className="menu" aria-label="Áreas">
        <a href="/adm/condominios">
          <strong>Condomínios</strong>
          <span>Endereço, cidade e situação</span>
        </a>
        <a href="/adm/sindicos">
          <strong>Síndicos</strong>
          <span>Atual e histórico de cada condomínio</span>
        </a>
        <a href="/adm/contratos">
          <strong>Contratos</strong>
          <span>Visitas, equipamentos e programação</span>
        </a>
        <a href="/adm/prestadores">
          <strong>Prestadores</strong>
          <span>WhatsApp e acesso ao aplicativo</span>
        </a>
        <a href="/adm/equipamentos">
          <strong>Equipamentos</strong>
          <span>Lista-base da ELEVA</span>
        </a>
      </nav>
    </Painel>
  )
}
