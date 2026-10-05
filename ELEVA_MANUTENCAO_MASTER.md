# ELEVA MANUTENÇÃO

## Documento Mestre de Desenvolvimento — MVP

**Versão:** 1.3
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
metadado ou qualquer outro conceito técnico. A senha inicial aparece uma
vez para o ADM repassar. Trocar para Não remove o login. Não enfraquecer
RLS nem autenticação para simplificar essa tela. O prestador autenticado
continua vendo só o que o perfil Prestador permite.

### equipamentos_matriz

id, nome, ativo. A interface mostra somente o nome do equipamento e
ativo/inativo. Não é ficha técnica: categoria, fabricante, modelo e
observações não aparecem e não devem voltar à tela. Se essas colunas
ainda existirem no banco por causa da migration já aplicada, ficam sem
uso e sem apagar dados antigos. Informações de um equipamento dentro de
um condomínio ficam em equipamentos do contrato, não na matriz.

### contratos

id, numero_contrato amigável, condominio_id, tipo(`mensal`),
data_inicio_contrato, data_fim_contrato, data_inicio_manutencao,
quantidade_visitas, prestador_padrao_id(opcional),
status(`ativo` | `encerrado` | `cancelado`), observacoes, timestamps.

No MVP todo contrato é mensal. Não existe tipo `avulso`. Duração
configurável; cenários comuns 12/36/48 meses. `data_fim_contrato` é
informação contratual e não recalcula a agenda.

### equipamentos_contrato

id, contrato_id, equipamento_matriz_id, nome_identificacao (ex. Esteira
01), data_entrada, ativo, data_saida(opcional), observacoes, timestamps.
O equipamento pertence ao contrato e não é recriado por visita.

### manutencoes

id, condominio_id, contrato_id, numero_visita, data_programada_original,
data_programada_atual, data_realizada, prestador_id,
tipo(`preventiva` | `corretiva` | `corretiva_complementar` | `avulsa`),
origem(`automatica` | `manual`), status, finalizada_em, finalizada_por,
observacoes_administrativas, pdf_url, ocorrencia_origem_id, timestamps.

- `condominio_id` é obrigatório.
- `preventiva`: exige contrato e `numero_visita`. Exibe Visita X/Y,
  com Y = `quantidade_visitas`.
- `corretiva`: exige contrato, sem numeração X/Y.
- `corretiva_complementar`: exige `ocorrencia_origem_id`, sem numeração
  X/Y. O histórico parte da ocorrência e encontra os retornos.
- `avulsa`: sem contrato, sem `numero_visita` e sem ocorrência de
  origem. É uma visita criada pelo ADM para um condomínio.

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
`aguardando_retorno`, `resolvida`, `encerrada`. A ocorrência não precisa
passar por todos. Nasce `resolvida` quando foi resolvida no local, e
`aberta` quando não foi.

Classificações previstas, apenas informativas: Contratual; Corretiva;
Corretiva complementar/retorno; Corretiva fora de contrato/com custo.
Não disparam automação no MVP.

## 7. Contratos e agenda

### Mensal

ADM informa **Data de Início da Manutenção** e **quantidade de visitas**.
O sistema gera exatamente essa quantidade, com periodicidade mensal, a
partir da data de início.

`data_fim_contrato` não altera a agenda. Se a última visita gerada cair
depois do fim do contrato, ou se o início for posterior ao fim, alertar
o ADM no cadastro, sem corrigir quantidade nem datas automaticamente.

Para dia inexistente em determinado mês, usar o último dia válido
daquele mês.

### Alteração de data

ADM pode alterar individualmente a data de qualquer visita já
cadastrada, inclusive futura. **Alterar uma visita nunca altera
automaticamente as seguintes.** Toda mudança gera histórico.

### Avulsa

Não existe contrato avulso. A manutenção avulsa é uma visita criada
manualmente pelo ADM para um condomínio, com data, prestador e
equipamentos aplicáveis selecionados para aquela execução.

Não usa numeração Visita X/Y. Na interface e no PDF o rótulo é
**Manutenção Avulsa** mais a data. A data pode ser alterada depois, com
histórico.

## 8. Itens da visita

A visita de contrato contém os equipamentos daquele contrato cuja
participação bate com a data programada atual:

- entra quando `data_programada_atual` é igual ou posterior à
  `data_entrada`;
- sai nas visitas posteriores à `data_saida` (na própria data de saída
  ainda participa).

A lista só é recalculada em visita `programada` ou `em_execucao`. Em
execução, equipamento novo elegível entra como pendente; item já marcado
não é apagado. Visitas `realizada`, `aguardando_administracao` e
`cancelada` não são alteradas retroativamente.

Garantir ausência de duplicidade e histórico consistente. Navegação
nunca gera registro vazio.

Na avulsa, os itens são os equipamentos que o ADM selecionou para aquela
execução, a partir da matriz, com nome de identificação.

## 9. Fluxo do prestador

Tela inicial: visitas de hoje, próximas e atrasadas, com condomínio,
data, identificação da visita, tipo e situação. Preventiva mostra
Visita X/Y. Avulsa mostra Manutenção Avulsa e a data.

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

## 10. Finalização

**Finalizar visita** só habilita quando todos os equipamentos estiverem
OK ou Ocorrência. Ao finalizar, registrar data/hora/usuário e bloquear
edição normal pelo prestador.

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

Nasce com status `aberta` e vai à fila ADM. ADM decide orçamento,
retorno, classificação, descrição padronizada, texto ao síndico, envio
e status. Pode usar qualquer status da lista, sem ordem obrigatória.

A classificação interna não cria automação.

## 12. Retorno

Segunda ida para resolver ocorrência não é nova preventiva mensal. ADM
cria `corretiva_complementar`, com `ocorrencia_origem_id` apontando para
a ocorrência original, com data, prestador e execução próprios. A
consulta da ocorrência mostra os retornos ligados a ela.

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

Preventiva: Visita X/Y. Avulsa: Manutenção Avulsa e a data, sem X/Y.

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

Rastrear reagendamento, finalização, alteração administrativa, retorno e
cancelamento. Preferir exclusão lógica para histórico relevante. Proibir
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
2. contrato mensal com data inicial e quantidade de visitas;
3. geração da agenda sem recalcular pelo fim do contrato;
4. vínculo de equipamentos conforme entrada e saída;
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
inexistente e alerta de fim de contrato, sem correção automática.

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
avulsa, reagendamento/histórico.
**Fase 4 — Prestador:** agenda, visita, equipamentos, OK/Ocorrência,
foto, progresso, finalização.
**Fase 5 — ADM de ocorrências:** fila, classificação, orçamento,
retorno, texto, status, histórico.
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
matriz; voltar o acesso do prestador para escolha técnica de usuário.

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
1.3 mantém o que a 1.2 fechou e registra a validação da Fase 2: consulta
de CEP no condomínio, acesso do prestador ao aplicativo em Sim ou Não, e
matriz de equipamentos apenas com nome e situação. Não recriar categoria,
fabricante, modelo ou observações nessa tela, nem a escolha técnica de
usuário no prestador.

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
