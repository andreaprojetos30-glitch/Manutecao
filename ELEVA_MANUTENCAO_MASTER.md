# ELEVA MANUTENÇÃO

## Documento Mestre de Desenvolvimento --- MVP

**Versão:** 1.0\
**Status:** Fonte de verdade para desenvolvimento\
**Empresa:** ELEVA

## 1. Instrução principal

Leia este documento integralmente antes de desenvolver. Ele é a fonte de
verdade das regras de negócio do ELEVA Manutenção.

-   Não alterar regras definidas.
-   Não inventar regras de negócio.
-   Se houver decisão de negócio realmente não especificada, parar e
    perguntar.
-   Decisões técnicas podem ser tomadas desde que não alterem o
    comportamento do produto.
-   Desenvolver e validar por fases.
-   Priorizar simplicidade, confiabilidade, mobile e baixo retrabalho.
-   Nunca exibir IDs técnicos ao usuário.
-   Nenhuma navegação pode criar registros vazios; registros só existem
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

O MVP deve permitir: 1. cadastrar condomínios/clientes e síndicos; 2.
manter histórico de síndicos/contatos; 3. cadastrar prestadores e matriz
de equipamentos; 4. cadastrar contratos e equipamentos por contrato; 5.
gerar visitas mensais automaticamente; 6. cadastrar manutenção avulsa;
7. reagendar individualmente qualquer visita já criada, preservando
histórico e sem mover as seguintes; 8. executar visita pelo celular; 9.
marcar cada equipamento como OK ou Ocorrência; 10. registrar ocorrência
com resolução no local, descrição e foto; 11. finalizar somente quando
todos os equipamentos forem tratados; 12. encaminhar pendências ao ADM;
13. controlar orçamento, retorno e comunicação; 14. gerar PDF simples
como evidência de execução contratual; 15. manter histórico operacional;
16. oferecer dashboard administrativo enxuto.

## 4. Perfis

### ADM ELEVA

Acesso operacional completo: cadastros, contratos, agenda,
reagendamento, ocorrências, orçamento, retorno, classificação, textos,
comunicação, relatórios, correções e histórico.

### Prestador

Vê apenas visitas atribuídas. Em cada equipamento escolhe somente **OK**
ou **Ocorrência**. Na ocorrência informa apenas: - Resolvida no local?
Sim/Não - Descrição do que encontrou - Foto

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

## 6. Modelo de dados

Preferência: Supabase/PostgreSQL. Usar UUIDs internamente.

### usuarios

id, nome, email, telefone, perfil(admin\|prestador), ativo, created_at,
updated_at.

### condominios

id, nome, cep, endereco, numero(opcional), complemento, bairro, cidade,
estado, quantidade_unidades, ativo, observacoes, timestamps.

### sindicos

id, condominio_id, nome, whatsapp, email, data_inicio, data_fim, ativo,
timestamps. Não sobrescrever histórico na troca.

### prestadores

id, usuario_id(opcional), nome, whatsapp obrigatório, email, ativo,
observacoes, timestamps.

### equipamentos_matriz

id, nome, categoria, fabricante(opcional), modelo(opcional), ativo,
observacoes.

### contratos

id, numero_contrato amigável, condominio_id, tipo(mensal\|avulso),
data_inicio_contrato, data_fim_contrato, data_inicio_manutencao,
quantidade_visitas, prestador_padrao_id(opcional),
status(ativo\|encerrado\|cancelado), observacoes, timestamps. Duração
configurável; cenários comuns 12/36/48 meses.

### equipamentos_contrato

id, contrato_id, equipamento_matriz_id, nome_identificacao (ex. Esteira
01), data_entrada, ativo, data_saida(opcional), observacoes, timestamps.
O equipamento pertence ao contrato e não é recriado por visita.

### manutencoes

id, contrato_id, numero_visita, data_programada_original,
data_programada_atual, data_realizada, prestador_id,
tipo(preventiva\|corretiva\|corretiva_complementar\|avulsa),
origem(automatica\|manual), status, finalizada_em, finalizada_por,
observacoes_administrativas, pdf_url, timestamps. Status MVP:
programada, em_execucao, aguardando_administracao, realizada, cancelada.

### historico_reagendamentos

id, manutencao_id, data_anterior, nova_data, alterado_por,
motivo(opcional), created_at.

### itens_manutencao

id, manutencao_id, equipamento_contrato_id,
resultado(pendente\|ok\|ocorrencia), registrado_por, registrado_em,
observacao(opcional). Unicidade: no máximo um item principal por
equipamento por manutenção.

### ocorrencias

id, item_manutencao_id, resolvida_no_local, descricao_original,
foto_url, necessita_orcamento, necessita_retorno, classificacao_interna,
descricao_padronizada, texto_para_sindico, enviar_para_sindico,
status_ocorrencia, observacoes_administrativas, data_registro,
timestamps. Somente resolvida_no_local, descricao_original e foto são
decisões/entradas do prestador.

## 7. Contratos e agenda

### Mensal

ADM informa **Data de Início da Manutenção**. O sistema gera
automaticamente as visitas mensais seguintes conforme duração/quantidade
de visitas.

Para dias inexistentes em determinado mês, usar regra técnica
consistente e documentada, preferencialmente o último dia válido do mês.

### Alteração de data

ADM pode alterar individualmente a data de qualquer visita já
cadastrada, inclusive futura. **Alterar uma visita nunca altera
automaticamente as seguintes.** Toda mudança gera histórico.

### Avulsa

ADM cria manualmente e informa a data. Pode alterar posteriormente,
também com histórico.

## 8. Itens da visita

A visita contém os equipamentos ativos daquele contrato. Garantir lista
correta, ausência de duplicidade e histórico consistente. A
implementação pode criar itens antecipadamente ou no início da execução,
mas navegação nunca pode gerar registro vazio.

## 9. Fluxo do prestador

Tela inicial: visitas de hoje, próximas e atrasadas, com condomínio,
data, Visita X/Y, tipo e situação.

Ao abrir visita: condomínio, data, número da visita, lista completa dos
equipamentos e contador de progresso.

Cada equipamento começa Pendente e recebe: - **OK**: registra
usuário/data/hora. - **Ocorrência**: abre formulário com apenas
Resolvida no local?, Descrição e Foto.

O sistema vincula automaticamente manutenção, item, equipamento,
contrato, condomínio e prestador. O prestador não seleciona vínculos.

## 10. Finalização

**Finalizar visita** só habilita quando todos os equipamentos estiverem
OK ou Ocorrência. Ao finalizar, registrar data/hora/prestador, bloquear
edição normal pelo prestador, encaminhar pendências ao ADM e atualizar
status. ADM pode corrigir com rastreabilidade.

## 11. Ocorrências

### Resolvida no local

Permanece no histórico interno. Não aparece ao síndico como
pendência/ocorrência externa. No PDF, equipamento pode constar como
verificado/concluído.

### Não resolvida

Vai à fila ADM. ADM decide orçamento, retorno, classificação, descrição
padronizada, texto ao síndico, envio e status.

Classificações previstas: Contratual; Corretiva; Corretiva
complementar/retorno; Corretiva fora de contrato/com custo. Prestador
não classifica.

## 12. Retorno

Segunda ida para resolver ocorrência não é nova preventiva mensal. ADM
cria `corretiva_complementar`, vinculada à ocorrência original, com
data, prestador e execução próprios.

## 13. Orçamento

Decisão administrativa. MVP registra necessidade e situação; aprovação
externa pode ser registrada pelo ADM. Não criar módulo financeiro
completo sem nova definição.

## 14. Síndico

Sem portal no MVP. ADM decide comunicação, texto, orçamento e relatório.
Arquitetura pode permitir WhatsApp/e-mail futuramente, sem tornar
integração externa obrigatória agora.

## 15. PDF

Simples, profissional, preferencialmente uma página quando possível.
Deve ser **evidência de execução contratual**.

Conteúdo: identidade ELEVA, condomínio, contrato amigável, visita X/Y,
tipo, data, prestador, equipamentos verificados, resultados, ocorrências
comunicáveis, fotos pertinentes, conclusão e status de execução.

Não mostrar IDs, classificação interna, observações administrativas ou
ocorrência resolvida no local como pendência externa. Identidade visual
final pode ser refinada depois.

## 16. Dashboard ADM

Priorizar: próximas visitas, atrasadas, realizadas, ocorrências
aguardando análise, retornos, orçamento pendente e contratos ativos.
Evitar BI excessivo no MVP.

## 17. Telas mínimas

Dashboard; Condomínios; Síndicos; Contratos; Equipamentos do contrato;
Prestadores; Agenda/Manutenções; Detalhe da visita; Ocorrências;
Tratamento da ocorrência; Histórico; Relatórios/PDFs.

## 18. Segurança

Supabase Auth preferencial. RLS/políticas por perfil. Prestador só
acessa dados necessários às visitas atribuídas. ADM acessa operação
completa. Não confiar em ocultação frontend. Storage protegido para
fotos/PDFs. Nunca expor chaves privadas.

## 19. Integridade/auditoria

Rastrear reagendamento, finalização, alteração administrativa, retorno e
cancelamento. Preferir exclusão lógica para histórico relevante. Proibir
ocorrência órfã, item sem manutenção, equipamento de outro contrato,
duplicidade do equipamento na visita e finalização com pendência.

## 20. IDs

IDs técnicos jamais aparecem na interface. Mostrar nomes humanos como
Condomínio Porta do Sol, Contrato 2026-001, Visita 5/12, Esteira 01.

## 21. Erros e estados vazios

Tratar carregamento, nenhum registro, erro de rede, falha ao salvar,
foto não enviada e formulário inválido. Nunca deixar página em branco.
Desabilitar botão durante salvamento e prevenir duplo envio.

## 22. Fotos

Permitir captura/seleção mobile, preview e feedback de upload. Falha de
upload obrigatório não pode ser silenciosa.

## 23. Critérios de aceite do MVP

O sistema deve passar ponta a ponta por: 1. cadastro de
condomínio/síndico/prestador; 2. contrato mensal com data inicial; 3.
geração da agenda; 4. vínculo de equipamentos; 5. prestador vê e abre
visita; 6. equipamento OK; 7. outro equipamento com ocorrência; 8.
ocorrência pede somente resolução, descrição e foto; 9. vínculo
automático; 10. finalização bloqueada com pendências; 11. finalização
após todos tratados; 12. ocorrência não resolvida chega ao ADM; 13. ADM
classifica e trata; 14. resolvida no local fica só no histórico interno;
15. reagendamento futuro não altera visitas seguintes; 16. histórico de
reagendamento preservado; 17. retorno complementar vinculado à origem;
18. PDF gerado como evidência de execução; 19. nenhum ID visível; 20.
nenhum clique cria ocorrência vazia; 21. reload não perde dados; 22.
prestador não acessa administração.

## 24. Testes obrigatórios

A)  tudo OK; B) ocorrência resolvida no local; C) ocorrência não
    resolvida com foto e tratamento; D) reagendamento; E) retorno
    complementar; F) proteção de rota administrativa.

## 25. Fora do MVP / V2

Relatórios gerenciais avançados; custos por ocorrência; IA para
padronização; áudio; portal do síndico; aprovação online de orçamento;
WhatsApp avançado; dashboards financeiros; orçamento completo; BI; push;
assinatura eletrônica; estoque/peças.

## 26. Arquitetura sugerida

Aplicação web responsiva/PWA; frontend moderno compatível com o projeto;
Supabase/PostgreSQL; Supabase Auth; Supabase Storage; migrations SQL
versionadas; `.env`; deploy cloud; sistema deve funcionar sem computador
local ligado.

## 27. Ordem de desenvolvimento

**Fase 1 --- Fundação:** projeto, banco, migrations, autenticação,
perfis, RLS.\
**Fase 2 --- Cadastros:** condomínios, síndicos, prestadores, matriz.\
**Fase 3 --- Contratos:** contrato, equipamentos, agenda automática,
avulsa, reagendamento/histórico.\
**Fase 4 --- Prestador:** agenda, visita, equipamentos, OK/Ocorrência,
foto, progresso, finalização.\
**Fase 5 --- ADM de ocorrências:** fila, classificação, orçamento,
retorno, texto, status, histórico.\
**Fase 6 --- Relatório:** PDF, armazenamento, consulta.\
**Fase 7 --- QA/piloto:** critérios de aceite, bugs, mobile e primeiro
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
do PDF.

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
regras de negócio. Não substitua suas regras por suposições.

**Antes de implementar**, audite o repositório atual e informe: 1. stack
existente; 2. estrutura de arquivos; 3. integrações configuradas; 4.
estado do Supabase; 5. o que pode ser reaproveitado; 6. conflitos entre
código atual e documento mestre; 7. plano de implementação por fases.

Não implemente tudo de uma vez. Após a auditoria, comece somente pela
**Fase 1 --- Fundação**.

Preserve migrations versionadas e segurança por perfil. A aplicação deve
ser mobile-first para o prestador e eficiente no desktop para o ADM.

IDs são internos e nunca aparecem como informação de interface. Nenhuma
navegação ou abertura de formulário pode criar registros vazios.

Quando houver decisão de negócio não definida, pare e pergunte antes de
implementar.

Ao concluir cada fase, execute os testes aplicáveis, descreva o que foi
feito e aguarde validação antes de mudanças estruturais.
