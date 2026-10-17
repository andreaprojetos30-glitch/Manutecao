# ELEVA MANUTENÇÃO

## Documento Mestre de Desenvolvimento — MVP

**Versão:** 1.14
**Status:** Fonte de verdade para desenvolvimento
**Empresa:** ELEVA

## 1. Instrução principal

Leia este documento integralmente antes de desenvolver. Ele é a fonte de
verdade das regras de negócio do ELEVA Manutenção.

- Não alterar regras definidas.
- Não inventar regras de negócio.
- Se houver decisão de negócio realmente não especificada, parar e
  perguntar.
- Decisões técnicas podem ser tomadas desde que não alterem o
  comportamento do produto.
- Desenvolver e validar por fases.
- Priorizar simplicidade, confiabilidade, mobile e baixo retrabalho.
- Todo o projeto segue a identidade visual da ELEVA, definida na seção 5.
- Nunca exibir IDs técnicos ao usuário.
- Nenhuma navegação pode criar registros vazios; registros só existem
  após salvamento válido ou automação intencional.

## 2. Visão do produto

O ELEVA Manutenção é o sistema operacional da ELEVA para administrar
manutenção de equipamentos de academias em condomínios e outros
clientes.

Princípio: **mais simples que planilha, mais organizado que WhatsApp e
mais confiável que a memória.**

O prestador registra fatos. A ELEVA interpreta, administra e se comunica
com o cliente.

## 3. Escopo do MVP

O MVP deve permitir:

1. cadastrar condomínios/clientes e síndicos;
2. manter histórico de síndicos/contatos;
3. cadastrar prestadores e matriz de equipamentos;
4. cadastrar contratos e equipamentos por contrato;
5. gerar visitas mensais automaticamente;
6. cadastrar manutenção avulsa;
7. reagendar individualmente qualquer visita já criada, preservando
   histórico e sem mover as seguintes;
8. executar visita pelo celular;
9. marcar cada equipamento como OK ou Ocorrência;
10. registrar ocorrência com resolução no local, descrição e foto;
11. finalizar somente quando todos os equipamentos forem tratados;
12. encaminhar pendências ao ADM;
13. controlar orçamento, retorno e comunicação;
14. gerar PDF simples como evidência de execução contratual;
15. manter histórico operacional;
16. oferecer dashboard administrativo enxuto.

## 4. Perfis

Não há autocadastro público. O ADM cria ou libera o usuário já com perfil
explícito: `admin` ou `prestador`. O sistema não atribui perfil
automaticamente. Usuário sem um desses dois perfis, ou inativo, não
acessa as áreas operacionais.

### ADM ELEVA

Acesso operacional completo: cadastros, contratos, agenda,
reagendamento, ocorrências, orçamento, retorno, classificação, textos,
comunicação, relatórios, correções e histórico.

### Prestador

Vê apenas visitas atribuídas. Em cada equipamento escolhe somente **OK**
ou **Ocorrência**. Na ocorrência informa apenas:

- Resolvida no local? Sim/Não
- Descrição do que encontrou
- Foto

Os três campos são obrigatórios. Sem eles, a ocorrência não é salva.

Não decide cobertura contratual, orçamento, retorno, classificação,
texto ao síndico, envio ao síndico ou status administrativo.

### Síndico

Sem login no MVP. Recebe comunicação e relatório pela ELEVA.

## 5. UX obrigatória

Mobile-first; poucos cliques; linguagem clara; labels amigáveis; nenhuma
exibição de UUID/ID; busca por nome/cidade/bairro; telas simples; mínimo
de decisões para prestador; campos administrativos invisíveis ao
prestador; cancelar formulário não persiste nada; nenhum clique cria
ocorrência vazia.

### Identidade visual

Todo o projeto segue a identidade visual da ELEVA. Telas do prestador e
do ADM, login, PDF, estados vazios, mensagens e qualquer peça gerada
pelo sistema usam a mesma marca. Não criar paleta, tipografia ou
logotipo próprios, e não deixar a identidade para refinar depois.

| Token | Uso |
|---|---|
| `#1e3a2b` | verde da marca: títulos, ações principais, faixas |
| `#b08d57` | dourado da marca; apoio em `#d4bc8a` e `#8d7044` |
| `#f3f0ea` | fundo |
| Cormorant Garamond | títulos e wordmark ELEVA |
| Outfit | rótulos, textos e interface |

Verde e dourado prevalecem. Cores de estado (erro, sucesso, alerta)
existem só para feedback e não substituem a marca. O logo da ELEVA
aparece no acesso e no PDF.

## 6. Modelo de dados

Preferência: Supabase/PostgreSQL. Usar UUIDs internamente.

### usuarios

id, nome, email, telefone, perfil(`admin` | `prestador` | nulo), ativo,
created_at, updated_at.

Perfil nulo significa conta ainda não liberada. Não usar nulo como
sinônimo de prestador.

### condominios

id, nome, cep, endereco, numero(opcional), complemento, bairro, cidade,
estado, quantidade_unidades, ativo, observacoes, timestamps.

Ao informar um CEP válido, a tela preenche logradouro, bairro, cidade e
UF quando o serviço devolver esses dados. Número e complemento continuam
manuais e podem ficar vazios. Depois do preenchimento, o ADM pode
corrigir qualquer campo. CEP inválido, CEP não encontrado ou serviço
indisponível mostram um aviso e não impedem o cadastro manual. A busca
de condomínios continua por nome, cidade e bairro.

### sindicos

id, condominio_id, nome, whatsapp, email, data_inicio, data_fim, ativo,
timestamps. Não sobrescrever histórico na troca. No máximo um síndico
ativo por condomínio.

### prestadores

id, usuario_id(opcional), nome, whatsapp obrigatório, email, ativo,
observacoes, timestamps.

Na interface, o acesso ao aplicativo é Sim ou Não. O padrão é Não. Não
cadastra o prestador sem login. Sim libera o acesso a partir do e-mail,
sempre com perfil exclusivamente `prestador`, sem mostrar identificador,
metadado ou qualquer outro conceito técnico. A ELEVA envia um link de
ativação, de uso único e com prazo. No celular, o prestador ativa o
acesso e escolhe um PIN numérico de exatamente 3 dígitos. A sessão do
Supabase permanece no aparelho. O PIN só desbloqueia essa sessão: não
substitui a autenticação e não é aceito sozinho pelo servidor. A ELEVA
não vê o PIN. Tentativas repetidas pausam o desbloqueio e, se continuarem,
exigem nova ativação. O ADM pode revogar o acesso ou pedir nova ativação
sem conhecer o PIN. Trocar para Não remove o login. Não enfraquecer RLS
nem autenticação para simplificar essa tela. O prestador autenticado
continua vendo só o que o perfil Prestador permite.

### equipamentos_matriz

id, nome, ativo. A interface mostra somente o nome do equipamento e
ativo/inativo. Não é ficha técnica: categoria, fabricante, modelo e
observações não aparecem e não devem voltar à tela. Se essas colunas
ainda existirem no banco por causa da migration já aplicada, ficam sem
uso e sem apagar dados antigos. Informações de um equipamento dentro de
um condomínio ficam em equipamentos do contrato, não na matriz.

A tela Equipamentos mostra a matriz inteira, em ordem alfabética pelo
nome, sem teto fixo de poucos itens. O padrão é Todos. Há busca pelo
nome e filtro Ativos, Inativos ou Todos. O total fica visível, por
exemplo “32 equipamentos”. Cada item tem Editar e Ativar/Inativar, para
o ADM ver, localizar e administrar sem abrir a ficha só para consultar
ou mudar a situação. No celular a lista é vertical. No desktop ela usa
a largura em colunas. Se a quantidade crescer, o restante entra por
carregamento progressivo, com o total sempre visível. Não exibir
categoria, fabricante, modelo, observações nem IDs.

### contratos

id, numero_contrato amigável, condominio_id, tipo(`mensal`),
data_inicio_contrato, data_fim_contrato, data_inicio_manutencao,
quantidade_visitas, prestador_padrao_id(opcional),
status(`ativo` | `encerrado` | `cancelado`), observacoes, timestamps.

No MVP todo contrato é mensal. Não existe tipo `avulso`. Duração
configurável; cenários comuns 12/36/48 meses. `data_inicio_contrato` é
o início da vigência. `data_inicio_manutencao` é a referência das
visitas. `data_fim_contrato` é obrigatório e calculado: a data da
última visita mensal. O ADM não informa essa data.

### equipamentos_contrato

id, contrato_id, equipamento_matriz_id, identificacao opcional, ativo,
observacoes, timestamps. A composição atual são os registros ativos.
`data_entrada` e `data_saida` podem continuar no banco por
compatibilidade e não participam da operação do MVP. O equipamento
pertence ao contrato e não é recriado por visita.

O ADM inclui os equipamentos em lote, a partir dos itens ativos da
matriz. A tela lista a matriz inteira, em ordem alfabética, com busca
pelo nome, um checkbox por equipamento e a quantidade daquele tipo. A
quantidade padrão é 1. Marcar Esteira com quantidade 3 cria três
unidades de Esteira, sem repetir a inclusão. Não há amostra fixa nem
limite de três itens. Equipamento inativo da matriz não entra em
seleção nova; o que já estiver no contrato permanece até ser retirado.

O nome de cada unidade vem sempre da matriz. A identificação individual
é opcional, nasce vazia e não é preenchida com 01, 02 nem com o texto
“sem identificação”. Se o ADM quiser, informa depois uma identificação
para aquela unidade, por exemplo 01 ou outro texto curto. Na composição,
a identificação aparece ao lado do nome somente quando existir. O ADM
pode editar a identificação, retirar a unidade ou adicionar outros
equipamentos.

### manutencoes

id, condominio_id, contrato_id, numero_visita, data_programada_original,
data_programada_atual, data_realizada, prestador_id,
tipo(`preventiva` | `corretiva` | `corretiva_complementar` | `avulsa`),
origem(`automatica` | `manual`), status, finalizada_em, finalizada_por,
observacoes_administrativas, pdf_url, ocorrencia_origem_id, timestamps.

- `condominio_id` é obrigatório.
- `preventiva`: exige contrato e `numero_visita`. Exibe Visita X/Y,
  com Y = `quantidade_visitas`. O número é a posição permanente no
  contrato. Reagendamento não muda esse número.
- `corretiva`: exige contrato, sem numeração X/Y. Não consome visita
  preventiva.
- `corretiva_complementar`: exige `ocorrencia_origem_id`, sem numeração
  X/Y. O histórico parte da ocorrência e encontra os retornos. Não
  consome visita preventiva.
- `avulsa`: sem contrato, sem `numero_visita` e sem ocorrência de
  origem. É uma visita criada pelo ADM para um condomínio. Não consome
  visita preventiva.
- `registro_anterior`: marca a preventiva realizada fora do aplicativo,
  antes da implantação. Não é execução do prestador.

Status da visita:

- `programada` enquanto nenhum OK e nenhuma ocorrência tiverem sido
  registrados. Abrir ou visualizar a visita não muda o status.
- `em_execucao` no primeiro OK ou na primeira ocorrência registrada.
- Ao finalizar, tudo OK ou somente ocorrências resolvidas no local vira
  `realizada`.
- Ao finalizar, pelo menos uma ocorrência não resolvida vira
  `aguardando_administracao`.
- `cancelada` somente pelo ADM.

### historico_reagendamentos

id, manutencao_id, data_anterior, nova_data, alterado_por,
motivo(opcional), created_at.

### itens_manutencao

id, manutencao_id, equipamento_contrato_id, equipamento_matriz_id,
nome_identificacao, resultado(`pendente` | `ok` | `ocorrencia`),
registrado_por, registrado_em, observacao(opcional).

Visita de contrato aponta `equipamento_contrato_id`. Visita avulsa
aponta `equipamento_matriz_id` e o nome daquela execução. Unicidade: no
máximo um item principal por equipamento por manutenção.

### ocorrencias

id, item_manutencao_id, resolvida_no_local, descricao_original,
foto_url, necessita_orcamento, necessita_retorno, classificacao_interna,
descricao_padronizada, texto_para_sindico, enviar_para_sindico,
status_ocorrencia, observacoes_administrativas, data_registro,
timestamps.

`resolvida_no_local`, `descricao_original` e `foto_url` são obrigatórios
e são as únicas entradas do prestador. A foto é obrigatória em toda
ocorrência, resolvida no local ou não.

`necessita_orcamento` e `necessita_retorno` são Sim/Não definidos pelo
ADM.

Status permitidos: `aberta`, `em_analise`, `aguardando_orcamento`,
`aguardando_aprovacao`, `aguardando_execucao`, `retorno_programado`,
`aguardando_retorno`, `resolvida`, `encerrada`. A ocorrência não precisa
passar por todos. Nasce `resolvida` quando foi resolvida no local, e
`aberta` quando não foi. Na Fase 5A o ADM escolhe, dentro da própria
manutenção: Em análise, Aguardando orçamento, Aguardando aprovação do
condomínio, Aguardando execução, Retorno técnico programado ou
Resolvida. Essa situação não substitui o status da visita.

Classificações previstas, apenas informativas: Contratual; Corretiva;
Corretiva complementar/retorno; Corretiva fora de contrato/com custo.
Não disparam automação no MVP.

## 7. Contratos e agenda

### Mensal

ADM informa **Data de Início da Manutenção** e **quantidade de visitas**.
O sistema gera exatamente essa quantidade, com periodicidade mensal, a
partir da data de início da manutenção.

`data_fim_contrato` não é digitado. É a data da última visita dessa
programação, calculada com a mesma regra das visitas mensais. No
formulário, o valor aparece na hora e muda se o ADM alterar o início da
manutenção ou a quantidade, para conferência antes de salvar e antes de
gerar a programação.

Exemplo: início da manutenção em 14/10/2026 e 12 visitas. A programação
vai de 14/10/2026 até 14/09/2027. O fim do contrato fica em 14/09/2027.

`data_inicio_contrato` é o início da vigência contratual. Não gera as
visitas e não define o fim. O fim vem da programação de manutenção.

Depois que a programação foi gerada, o condomínio, o início da
manutenção e a quantidade permanecem. O fim permanece junto, porque
depende desses dois dados.

### Contrato já em andamento

A numeração conta a posição real da preventiva no contrato, mesmo quando
parte das visitas ocorreu antes do sistema. O ADM informa a quantidade
já realizada e a data efetiva de cada uma. O calendário mensal original
permanece. A visita seguinte continua na data que a regra mensal já
definiu. Se a próxima ida for em outro dia, o ADM reagenda só essa
visita. As demais datas não se deslocam.

Exemplo: início da manutenção em 01/01/2026, 12 visitas, 7 já realizadas.
A próxima é a 8 de 12, na data mensal da oitava visita. A sétima pode
ter sido realizada em 10/10/2026: essa é a data efetiva, e a data
programada de julho permanece no calendário.

O registro anterior nasce realizado, sem prestador, sem equipamento,
sem foto e sem ocorrência. Não se inventa checklist nem evidência. Só
é gravado com confirmação explícita do ADM. Visita que já tenha
execução iniciada no aplicativo não entra nessa conversão. Se uma das
posições escolhidas não puder ser convertida, nada é gravado.

O registro anterior aparece na agenda e no histórico do contrato, só
para o ADM, com Visita N/total e a data efetiva. O prestador não vê
essas visitas. A execução feita no aplicativo permanece distinta: ela
tem checklist, finalização e data efetiva igual ao dia em que foi
concluída.

Não se duplica visita nem se apaga registro existente. Corretiva,
retorno e avulsa continuam fora da contagem preventiva.

Para dia inexistente em determinado mês, usar o último dia válido
daquele mês. Se a última visita cair nesse dia, o fim do contrato usa
o mesmo dia.

### Alteração de data

ADM pode alterar individualmente a data de qualquer visita ainda
`programada`, inclusive futura ou atrasada. Visita em execução,
realizada, aguardando administração ou cancelada não muda de data.
**Alterar uma visita nunca altera automaticamente as seguintes.** Toda
mudança gera histórico com a data anterior, a nova data, o usuário
responsável e o momento da alteração. O prestador não reagenda.

A agenda do ADM lista as visitas, com condomínio, data, prestador,
identificação da visita e status. Há busca por condomínio e filtros por
data, prestador e status. Visita programada com data anterior a hoje
aparece como atrasada. Abrir a visita não muda o status.

### Avulsa

Não existe contrato avulso. A manutenção avulsa é uma visita criada
manualmente pelo ADM para um condomínio, com data, prestador e
equipamentos ativos da matriz selecionados para aquela execução. Não
depende de equipamentos já vinculados a um contrato.

Não usa numeração Visita X/Y. Na interface e no PDF o rótulo é
**Manutenção Avulsa** mais a data. A data pode ser alterada depois, com
o mesmo histórico, e essa alteração não mexe na programação preventiva.

Avulsa cadastrada por engano pode ser excluída somente pelo ADM, e
somente enquanto estiver `programada`, sem registro de execução e sem
ocorrência. A tela pede confirmação. A exclusão remove a visita e os
registros preparatórios ligados a ela, como itens ainda pendentes e o
histórico de reagendamento daquela visita. A auditoria guarda o
responsável, a data e hora e a identificação da visita, no formato
Manutenção Avulsa mais a data. Essa exclusão não altera as outras
visitas nem a programação dos contratos.

Visita já iniciada, realizada, aguardando administração ou cancelada não
é apagada. O cancelamento administrativo continua disponível e preserva
o histórico. Manutenção preventiva do contrato não pode ser excluída
individualmente. Reagendamento e cancelamento dessas visitas permanecem
como já definidos.

## 8. Itens da visita

A composição do contrato é a lista atual de equipamentos ativos. Na
geração da programação, cada visita preventiva recebe essa composição.
A geração não se repete e não muda porque a composição mudou.

Depois da programação, alterar a composição não recria a agenda e não
altera datas.

- Visitas `realizada`, `em_execucao`, `aguardando_administracao` e
  `cancelada` não mudam.
- Visita `programada` com data anterior a hoje não muda.
- Visita `programada` de hoje em diante recebe a composição atual.
  Equipamento novo entra como pendente. Equipamento retirado sai quando
  o item ainda está pendente. A identificação nova acompanha só essas
  visitas.
- O histórico das demais visitas conserva o equipamento e o nome que
  já tinha.

Retirar um equipamento que já consta em visita protegida inativa o
vínculo e preserva esses itens. Retirar um equipamento que só está em
visitas futuras programadas, ou que ainda não entrou em visita, exclui
o vínculo.

Antes da programação, o ADM adiciona e retira equipamentos sem criar
visitas. A inclusão é a seleção em lote descrita em equipamentos do
contrato: checkbox, quantidade e identificação opcional. O nome exibido
é o da matriz.

Garantir ausência de duplicidade. Navegação nunca gera registro vazio.

Na avulsa, os itens são os equipamentos que o ADM selecionou para aquela
execução, a partir da matriz, com nome de identificação.

## 9. Fluxo do prestador

Tela inicial: visitas de hoje, próximas e atrasadas, com condomínio,
data, identificação da visita, tipo e situação. Preventiva mostra
Visita X/Y. Avulsa mostra Manutenção Avulsa e a data. Registro anterior
à implantação não aparece para o prestador.

Ao abrir visita: condomínio, data, identificação da visita, lista
completa dos equipamentos e contador de progresso. Abrir a visita não
muda o status.

Cada equipamento começa Pendente e recebe:

- **OK**: registra usuário/data/hora.
- **Ocorrência**: formulário com Resolvida no local?, Descrição e Foto,
  todos obrigatórios. Sem os três, nada é salvo.

O sistema vincula automaticamente manutenção, item, equipamento,
contrato quando houver, condomínio e prestador. O prestador não
seleciona vínculos.

A área do prestador se chama **Minhas Manutenções**. Ele vê somente as
visitas atribuídas a ele, futuras, atrasadas e em andamento, sem limite
de três registros. Concluídas, aguardando administração e canceladas
ficam no histórico, somente para consulta. Cada visita mostra
condomínio, data, tipo, Visita X/Y quando for contratual, status e
quantidade de equipamentos. Avulsa aparece como Manutenção Avulsa e a
data, sem numeração.

A lista pode ser atualizada sem bloquear o celular e sem novo login. O
botão **Atualizar** busca de novo as visitas atribuídas ao prestador. A
mesma busca ocorre quando ele volta a Minhas Manutenções ou reabre o
aplicativo. A sessão autenticada permanece. OK, ocorrência, correção e
finalização não mudam.

Abrir a visita não muda o status. O primeiro OK ou a primeira ocorrência
salva passa a visita para `em_execucao`. O progresso fica visível, por
exemplo “4 de 6 equipamentos verificados”, com o texto Pendente, OK ou
Ocorrência em cada equipamento. A identificação individual aparece
junto do nome quando existir.

Antes da finalização, o prestador pode corrigir: trocar OK por
ocorrência, voltar para OK, alterar descrição, foto ou a resposta de
resolvida no local. A correção não duplica o item nem a ocorrência.
Depois de finalizada, cancelada ou aguardando administração, o prestador
não edita.

A ocorrência só nasce ao salvar descrição, foto e Resolvida no local.
Cancelar o formulário não grava nada. Foto é obrigatória e fica no
bucket privado `fotos`. Resolvida no local permanece no histórico
interno, sem pendência para o síndico. Não resolvida fica `aberta` para
a ELEVA, sem orçamento, classificação ou mensagem ao síndico. Essas
decisões continuam com o ADM.

Prestador inativo ou sem acesso não executa. Ele não reagenda, não
cancela, não altera equipamento de contrato e não vê visita de outro
prestador.

## 10. Finalização

**Finalizar manutenção** pede confirmação. Só conclui quando todos os
equipamentos estiverem OK ou Ocorrência. Se faltar verificação, a
mensagem informa quantos equipamentos ainda faltam. Uma segunda
finalização não é aceita. Ao finalizar, registrar data/hora/usuário e
bloquear edição normal pelo prestador.

- Tudo OK, ou ocorrências somente resolvidas no local: status
  `realizada`.
- Pelo menos uma ocorrência não resolvida: status
  `aguardando_administracao` e a pendência segue para o ADM.

ADM pode corrigir com rastreabilidade. Cancelar a visita é ação
exclusiva do ADM.

## 11. Ocorrências

### Resolvida no local

Nasce com status `resolvida`. Permanece no histórico interno. Não
aparece ao síndico como pendência/ocorrência externa. No PDF, o
equipamento pode constar como verificado/concluído.

### Não resolvida

Nasce com status `aberta`. O tratamento acontece na tela da manutenção
em que a ocorrência foi registrada. Não há tela independente de
ocorrências. O ADM consulta a descrição e a foto originais, registra
observação ou providência, escolhe a situação e, ao resolver, registra
a solução. O registro do prestador não é alterado. Cada movimentação
fica no histórico da ocorrência, com data, hora, responsável, situação
anterior e nova quando houver mudança, e o texto registrado. O histórico
não pode ser apagado. A manutenção finalizada pelo prestador permanece
como registro, mesmo com o acompanhamento ainda aberto.

Classificação interna, descrição padronizada e texto ao síndico continuam
previstos e não fazem parte desta entrega. Não disparam automação.

## 12. Retorno

Segunda ida para resolver ocorrência não é nova preventiva mensal. Na
própria ocorrência, o ADM programa um retorno `corretiva_complementar`,
com `ocorrencia_origem_id`, a data e o prestador. O retorno usa o mesmo
condomínio e o mesmo equipamento, não recebe número de visita preventiva
e não altera as outras datas do contrato. A execução pelo prestador é a
já existente. A consulta da ocorrência mostra os retornos ligados a ela.
Enquanto houver retorno programado ou em execução, não se cria outro.

## 13. Orçamento

Decisão administrativa. `necessita_orcamento` é Sim/Não definido pelo
ADM. Aprovação externa pode ser registrada pelo ADM. Não criar módulo
financeiro completo sem nova definição.

## 14. Síndico

Sem portal no MVP. ADM decide comunicação, texto, orçamento e relatório.
Arquitetura pode permitir WhatsApp/e-mail futuramente, sem tornar
integração externa obrigatória agora.

## 15. PDF

Simples, profissional, preferencialmente uma página quando possível.
Deve ser **evidência de execução contratual**.

Conteúdo: identidade ELEVA, condomínio, contrato amigável quando houver,
identificação da visita, tipo, data, prestador, equipamentos
verificados, resultados, ocorrências comunicáveis, fotos pertinentes,
conclusão e status de execução.

Preventiva concluída traz, em destaque, a posição e a data efetiva:

**MANUTENÇÃO 7 DE 12 — REALIZADA EM 10/10/2026**

O número e o total são os da preventiva. A data é a efetiva: o dia da
finalização no aplicativo, ou a data informada pelo ADM no registro
anterior. A data programada não substitui essa frase. No registro
anterior, o PDF identifica a origem administrativa e não apresenta
checklist, foto ou ocorrência inventados. Avulsa: Manutenção Avulsa e
a data, sem X/Y. Corretiva e retorno também não usam a contagem
preventiva.

Não mostrar IDs, classificação interna, observações administrativas ou
ocorrência resolvida no local como pendência externa. O PDF usa a mesma
identidade visual da seção 5.

## 16. Dashboard ADM

Priorizar: próximas visitas, atrasadas, realizadas, ocorrências
aguardando análise, retornos, orçamento pendente e contratos ativos.
Evitar BI excessivo no MVP.

## 17. Telas mínimas

Dashboard; Condomínios; Síndicos; Contratos; Equipamentos do contrato;
Prestadores; Agenda/Manutenções; Detalhe da visita; Ocorrências;
Tratamento da ocorrência; Histórico; Relatórios/PDFs.

## 18. Segurança

Supabase Auth preferencial. Sem autocadastro público. O perfil
operacional é gravado na liberação administrativa e só aceita `admin`
ou `prestador`. Ausência de perfil válido não recebe área operacional.

RLS/políticas por perfil. Prestador só acessa dados necessários às
visitas atribuídas. ADM acessa operação completa. Não confiar em
ocultação frontend. Storage protegido para fotos/PDFs. Nunca expor
chaves privadas. Cancelamento de visita só pelo ADM, também no banco.

## 19. Integridade/auditoria

Rastrear reagendamento, finalização, alteração administrativa, retorno,
cancelamento e a exclusão de avulsa ainda não iniciada. Preferir
exclusão lógica para histórico relevante. A exceção é a avulsa
`programada` sem execução e sem ocorrência: ela pode ser removida, e o
rastro fica na auditoria. Proibir
ocorrência órfã, ocorrência sem foto ou sem descrição, item sem
manutenção, equipamento de outro contrato, duplicidade do equipamento na
visita, finalização com pendência e cancelamento por prestador.

## 20. IDs

IDs técnicos jamais aparecem na interface. Mostrar nomes humanos como
Condomínio Porta do Sol, Contrato 2026-001, Visita 5/12, Esteira 01,
Manutenção Avulsa 12/03/2026.

## 21. Erros e estados vazios

Tratar carregamento, nenhum registro, erro de rede, falha ao salvar,
foto não enviada e formulário inválido. Nunca deixar página em branco.
Desabilitar botão durante salvamento e prevenir duplo envio. Falha de
foto, descrição ou resolução no local impede salvar a ocorrência e
explica o motivo.

## 22. Fotos

Obrigatória em toda ocorrência. Permitir captura/seleção mobile, preview
e feedback de upload. Falha de upload não pode ser silenciosa nem gravar
a ocorrência sem a foto.

## 23. Critérios de aceite do MVP

O sistema deve passar ponta a ponta por:

1. cadastro de condomínio/síndico/prestador;
2. contrato mensal com início da manutenção e quantidade de visitas;
3. geração da agenda por essa regra, com o fim do contrato igual à data
   da última visita;
4. composição atual do contrato nas visitas, preservando o histórico já
   executado ou iniciado;
5. prestador vê e abre visita sem mudar o status só por abrir;
6. equipamento OK;
7. outro equipamento com ocorrência;
8. ocorrência só salva com resolução, descrição e foto;
9. vínculo automático;
10. finalização bloqueada com pendências;
11. finalização após todos tratados, com status `realizada` ou
    `aguardando_administracao` conforme a regra da seção 10;
12. ocorrência não resolvida chega ao ADM com status `aberta`;
13. ADM classifica e trata sem automação da classificação;
14. resolvida no local fica só no histórico interno, com status
    `resolvida`;
15. reagendamento futuro não altera visitas seguintes;
16. histórico de reagendamento preservado;
17. retorno complementar vinculado à ocorrência de origem;
18. PDF gerado como evidência de execução, e avulsa sem numeração X/Y;
19. nenhum ID visível;
20. nenhum clique cria ocorrência vazia;
21. reload não perde dados;
22. prestador não acessa administração;
23. não há autocadastro;
24. usuário sem perfil `admin` ou `prestador` não entra nas áreas
    operacionais;
25. visita `cancelada` só pelo ADM.

## 24. Testes obrigatórios

A) tudo OK; B) ocorrência resolvida no local; C) ocorrência não
resolvida com foto e tratamento; D) reagendamento; E) retorno
complementar; F) proteção de rota administrativa; G) conta sem perfil
válido; H) manutenção avulsa sem numeração X/Y; I) agenda com dia
inexistente e fim do contrato igual à data da última visita.

## 25. Fora do MVP / V2

Relatórios gerenciais avançados; custos por ocorrência; IA para
padronização; áudio; portal do síndico; aprovação online de orçamento;
WhatsApp avançado; dashboards financeiros; orçamento completo; BI; push;
assinatura eletrônica; estoque/peças. Contrato avulso e autocadastro
público também ficam de fora.

## 26. Arquitetura sugerida

Aplicação web responsiva/PWA; frontend moderno compatível com o projeto;
Supabase/PostgreSQL; Supabase Auth; Supabase Storage; migrations SQL
versionadas; `.env`; deploy cloud; sistema deve funcionar sem computador
local ligado.

## 27. Ordem de desenvolvimento

**Fase 1 — Fundação:** projeto, banco, migrations, autenticação sem
autocadastro, perfis explícitos, RLS.
**Fase 2 — Cadastros:** condomínios com consulta de CEP, síndicos,
prestadores com acesso ao aplicativo Sim/Não, matriz só com nome.
**Fase 3 — Contratos:** contrato mensal, equipamentos, agenda automática,
avulsa, reagendamento/histórico. A adequação dos contratos já em
andamento registra as preventivas anteriores, com confirmação do ADM,
sem checklist fictício, preservando numeração e datas mensais. Ela fica
pronta antes dos relatórios. O PDF que imprime a frase da manutenção
entra na Fase 6.
**Fase 4 — Prestador:** agenda, visita, equipamentos, OK/Ocorrência,
foto, progresso, finalização.
**Fase 5A — Tratamento na manutenção:** situação, providência, solução,
histórico e retorno técnico, dentro da visita. Sem fila separada.
**Fase 5B — Relatórios:** ainda não iniciada. Classificação, texto ao
síndico e PDF continuam fora desta etapa.
**Fase 6 — Relatório:** PDF, armazenamento, consulta.
**Fase 7 — QA/piloto:** critérios de aceite, bugs, mobile e primeiro
teste real.

Ao fim de cada fase: testar, informar implementado, listar pendências e
aguardar validação antes de mudanças estruturais.

## 28. Decisões permitidas e proibidas

Pode decidir sozinho: componentes, arquivos, bibliotecas auxiliares,
padrões de código, índices, cache, responsividade, validações técnicas,
erros e otimizações.

Não pode decidir sozinho: aumentar decisões do prestador; mudar fluxo de
ocorrência; contrato; reagendamento; conteúdo externo ao síndico;
cobrança; classificação de negócio; finalização; perfis; exclusão de
histórico; automações comerciais; trazer V2 para MVP; alterar conceito
do PDF; inventar paleta, fonte ou marca diferentes da identidade visual
da ELEVA; recolocar categoria, fabricante, modelo ou observações na
matriz; limitar a matriz ou a seleção de equipamentos do contrato a uma
amostra fixa de poucos itens; gerar identificação obrigatória para cada
unidade; voltar o acesso do prestador para escolha técnica de usuário.

Se necessário: **pare, descreva a dúvida objetivamente e peça decisão.**

## 29. Definição de sucesso

No primeiro piloto, um prestador deve executar uma visita real pelo
celular sem treinamento complexo, enquanto o ADM acompanha execução,
trata exceções e produz evidência clara do serviço.

------------------------------------------------------------------------

# PROMPT INICIAL PARA GROK / CURSOR

Você será responsável pelo desenvolvimento do sistema **ELEVA
Manutenção**.

Antes de escrever ou alterar código, leia integralmente
`ELEVA_MANUTENCAO_MASTER.md`. Este documento é a fonte de verdade das
regras de negócio. Não substitua suas regras por suposições. A versão
1.4 mantém o que a 1.3 fechou e define a listagem da matriz: todos os
equipamentos, em ordem alfabética, com busca, filtro, total visível e
Editar ou Ativar/Inativar em cada item. Não limitar essa tela a uma
amostra fixa, nem recriar categoria, fabricante, modelo ou observações.
A versão 1.5 calcula o fim do contrato como a data da última visita
mensal, a partir do início da manutenção e da quantidade. O ADM não
digita essa data. Início do contrato continua sendo apenas a vigência.
A versão 1.6 trata os equipamentos do contrato como a composição atual.
Não há data de entrada nem data de saída na operação. Depois da
programação, a mudança vale só para visitas futuras ainda programadas.
A versão 1.7 inclui esses equipamentos em lote, a partir da matriz
ativa, com quantidade por tipo. A identificação de cada unidade é
opcional, nasce vazia e não é gerada automaticamente. A versão 1.8
abre a agenda de manutenções no painel do ADM, com busca, filtros e
destaque de atrasadas. O reagendamento vale só para visita programada,
registra o histórico e não move as outras datas. A manutenção avulsa
nasce sem contrato e sem numeração Visita X/Y, com equipamentos ativos
da matriz. A versão 1.9 permite ao ADM excluir uma manutenção avulsa
cadastrada por engano, somente enquanto estiver programada e sem
execução ou ocorrência. A exclusão pede confirmação, fica na auditoria
e não altera as outras visitas nem a programação dos contratos. Visita
já iniciada e preventiva de contrato não são excluídas. A versão 1.10
abre Minhas Manutenções para o prestador executar no celular: OK,
ocorrência com foto, correção antes de finalizar e finalização como
realizada ou aguardando administração. A avulsa usa o mesmo fluxo, sem
numeração. O tratamento administrativo da ocorrência continua fora
desta etapa. A versão 1.11 troca a senha inicial longa do prestador por
ativação de uso único. Depois, o celular permanece conectado e abre com
um PIN de 3 números, que não autentica sozinho. O ADM revoga ou pede
nova ativação sem ver o PIN. As permissões da Fase 4 permanecem. A
versão 1.12 atualiza Minhas Manutenções pelo botão Atualizar e também
quando o prestador volta à tela ou reabre o aplicativo, sem bloquear,
desbloquear ou entrar de novo. A execução da visita permanece a da
versão 1.10. A versão 1.13 trata a ocorrência dentro da manutenção em
que ela foi registrada. O ADM acompanha a situação, registra providência
e solução e programa retorno técnico vinculado à ocorrência, sem nova
visita preventiva e sem alterar a programação do contrato. O prestador
não muda o tratamento administrativo. Relatórios e PDF não entram nesta
etapa. A versão 1.14 cobre o contrato já em andamento. O ADM informa
quantas preventivas ocorreram antes do sistema e a data efetiva de cada
uma. A numeração N/total permanece, o calendário mensal permanece e o
reagendamento continua individual. O registro anterior não gera
checklist, foto nem ocorrência, exige confirmação explícita e só o ADM
o vê, na agenda e no histórico do contrato. Visita com execução já
iniciada não é convertida. Corretiva, retorno e avulsa não entram na
contagem. O PDF da Fase 6 destaca a frase com a data efetiva e, quando
for o caso, a origem administrativa.

**Antes de implementar**, audite o repositório atual e informe:

1. stack existente;
2. estrutura de arquivos;
3. integrações configuradas;
4. estado do Supabase;
5. o que pode ser reaproveitado;
6. conflitos entre código atual e documento mestre;
7. plano de implementação por fases.

Não implemente tudo de uma vez. Após a auditoria, comece somente pela
**Fase 1 — Fundação**.

Preserve migrations versionadas e segurança por perfil. A aplicação deve
ser mobile-first para o prestador e eficiente no desktop para o ADM.

Todo o projeto — telas, PDF e peças geradas — segue a identidade visual
da ELEVA (seção 5): verde `#1e3a2b`, dourado `#b08d57`, fundo `#f3f0ea`,
Cormorant Garamond nos títulos e Outfit na interface. Não substituir
essa marca por outro visual.

IDs são internos e nunca aparecem como informação de interface. Nenhuma
navegação ou abertura de formulário pode criar registros vazios.

Quando houver decisão de negócio não definida, pare e pergunte antes de
implementar.

Ao concluir cada fase, execute os testes aplicáveis, descreva o que foi
feito e aguarde validação antes de mudanças estruturais.
