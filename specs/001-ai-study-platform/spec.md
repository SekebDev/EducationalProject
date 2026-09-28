# Feature Specification: Plataforma de estudos com professor de IA

**Feature Branch**: `main` (branch atual; nenhuma branch criada por hook)

**Created**: 2026-09-28

**Status**: Draft — validada para planejamento

**Updated**: 2026-09-28 — stack solicitada e critérios de design incorporados.

**Input**: Site para estudantes conversarem com um professor de IA com personalidade escolhida,
enviarem materiais de referência, criarem provas de 10 a 30 questões objetivas e discursivas,
receberem correção e explicações e acompanharem pontos fortes, fracos e novos exercícios direcionados.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conversar com um professor personalizado (Priority: P1)

O estudante escolhe o estilo do professor e começa a estudar pelo chat, mesmo sem enviar materiais.
Pode retomar uma conversa e alterar o estilo sem perder o contexto.

**Why this priority**: É o ponto de entrada e já oferece uma experiência útil de estudo.

**Independent Test**: Iniciar uma conversa sem materiais, fazer uma pergunta, trocar a personalidade
e reabrir a conversa para verificar continuidade e mudança de estilo.

**Acceptance Scenarios**:

1. **Given** um estudante na entrada do chat, **When** escolhe uma personalidade e pergunta sobre
   um assunto, **Then** recebe uma explicação no estilo escolhido, identificada como resposta de IA.
2. **Given** uma conversa existente, **When** troca a personalidade, **Then** as próximas respostas
   adotam o novo estilo preservando o histórico e sem modificar respostas anteriores.
3. **Given** um estudante autenticado com conversas salvas, **When** retorna ao site,
   **Then** pode reabrir seu histórico sem acessar dados de outros estudantes.
4. **Given** uma falha ao responder, **When** o estudante tenta novamente,
   **Then** a pergunta permanece disponível e não é duplicada no histórico.

---

### User Story 2 - Estudar com materiais próprios (Priority: P2)

O estudante envia materiais depois de começar o chat e seleciona quais o professor deve usar.
Consegue reconhecer a origem das explicações e saber quando o conteúdo não cobre sua pergunta.

**Why this priority**: Adapta o estudo ao conteúdo real do estudante sem bloquear o uso inicial.

**Independent Test**: Usar um documento com fatos conhecidos e perguntar sobre conteúdos presentes
e ausentes, verificando referências, limites e seleção dos materiais.

**Acceptance Scenarios**:

1. **Given** um PDF, DOCX ou TXT válido, **When** o estudante envia o arquivo,
   **Then** acompanha os estados recebido, em processamento, pronto ou falhou, com motivo da falha.
2. **Given** um material pronto e selecionado, **When** faz uma pergunta coberta pelo material,
   **Then** recebe resposta com referência ao arquivo e página, seção ou trecho identificável.
3. **Given** uma pergunta fora do material selecionado, **When** o professor responde,
   **Then** informa a ausência de suporte e distingue eventual conhecimento geral das referências.
4. **Given** um arquivo ilegível, protegido ou fora dos limites, **When** tenta enviá-lo,
   **Then** recebe orientação para corrigir o problema sem perder a conversa.
5. **Given** vários materiais, **When** desmarca ou exclui um deles,
   **Then** ele deixa de fundamentar novas respostas e novas provas.

---

### User Story 3 - Gerar e responder uma prova com correção (Priority: P2)

O estudante escolhe assunto, nível de estudo, materiais opcionais, quantidade e tipos de questões.
Responde às questões, recebe explicações nas objetivas e correção fundamentada nas discursivas.

**Why this priority**: Converte o estudo em prática verificável e produz dados para o acompanhamento.

**Independent Test**: Gerar provas de 10 e 30 questões com tema informado, sem depender do chat
ou de uploads, responder uma objetiva e uma discursiva e conferir a avaliação final.

**Acceptance Scenarios**:

1. **Given** um tema e configuração válida, **When** solicita a prova,
   **Then** recebe exatamente o total solicitado e a distribuição escolhida entre os tipos.
2. **Given** valores 9, 31 ou distribuição cuja soma difere do total, **When** solicita a prova,
   **Then** a geração não começa e os campos inválidos são indicados.
3. **Given** uma objetiva ainda não confirmada, **When** apenas seleciona uma alternativa,
   **Then** não vê gabarito nem explicação; ao confirmar, vê acerto ou erro, alternativa correta
   e justificativas de cada alternativa, e sua resposta fica registrada e bloqueada.
4. **Given** uma questão discursiva, **When** confirma sua resposta,
   **Then** recebe correção por IA com critérios, pontos obtidos, acertos, lacunas e resposta
   de referência; uma resposta parcialmente correta recebe pontuação parcial justificada.
5. **Given** uma tentativa parcialmente respondida, **When** sai e retorna,
   **Then** retoma respostas confirmadas e rascunhos salvos sem perder progresso.
6. **Given** questões pendentes, **When** pede para finalizar,
   **Then** é informado da quantidade não respondida e confirma a entrega; as não respondidas
   recebem zero, e correções ainda em processamento permanecem identificadas como pendentes.
7. **Given** falha na geração ou correção, **When** repete a operação,
   **Then** mantém respostas já salvas e não ganha uma segunda tentativa nem pontuação duplicada.

---

### User Story 4 - Entender resultados e evolução (Priority: P3)

O estudante consulta o desempenho por tema e ao longo do tempo, com explicações dos pontos fortes
e fracos e sugestões de estudo ligadas às respostas que forneceu.

**Why this priority**: Dá significado aos resultados, depois que há tentativas corrigidas.

**Independent Test**: Usar tentativas corrigidas conhecidas para verificar cálculos, gráficos,
limiares e recomendações sem gerar uma nova prova.

**Acceptance Scenarios**:

1. **Given** uma prova integralmente corrigida, **When** abre o resultado,
   **Then** vê nota, contagens por situação e desempenho por tema com exemplos das respostas.
2. **Given** pelo menos três questões corrigidas de um tema, **When** consulta os insights,
   **Then** temas com aproveitamento abaixo de 60% são pontos de atenção, de 60% a menos de 80%
   estão em desenvolvimento e de 80% em diante são pontos fortes.
3. **Given** menos de três questões corrigidas de um tema, **When** consulta o painel,
   **Then** vê dados insuficientes para classificação, sem inferência de domínio.
4. **Given** várias tentativas concluídas, **When** filtra por tema e período,
   **Then** gráficos e resumo textual refletem apenas as tentativas do filtro e exibem datas,
   quantidade de questões e nível de estudo, sem afirmar comparabilidade entre níveis diferentes.
5. **Given** nenhuma tentativa concluída ou correções pendentes, **When** abre o painel,
   **Then** vê um estado vazio ou provisório explícito, sem zeros inventados ou conclusão definitiva.

---

### User Story 5 - Praticar os pontos que precisam melhorar (Priority: P3)

O estudante seleciona temas indicados nos resultados e gera outra prova focada nesses assuntos,
mantendo os resultados anteriores para acompanhar sua evolução.

**Why this priority**: Fecha o ciclo entre avaliação, diagnóstico e nova prática.

**Independent Test**: Partir de um resultado conhecido, selecionar um ponto fraco e gerar
uma prova direcionada; conferir temas, quantidade, origem e separação das tentativas.

**Acceptance Scenarios**:

1. **Given** um insight sobre um tema, **When** escolhe praticá-lo,
   **Then** abre uma configuração com o tema preenchido e pode escolher de 10 a 30 questões.
2. **Given** vários temas selecionados, **When** gera a prática,
   **Then** todas as questões pertencem a esses temas e cada tema recebe ao menos uma questão.
3. **Given** uma nova prática corrigida, **When** retorna ao painel,
   **Then** vê o novo resultado separado e sua inclusão no histórico, sem alterar a prova anterior.

### Edge Cases

- Materiais sem texto extraível, vazios, protegidos por senha ou acima de 20 MB: rejeitar com motivo;
  documentos digitalizados sem texto não entram no escopo inicial de leitura.
- Conteúdo insuficiente para gerar a quantidade solicitada: explicar a limitação e solicitar mais
  material ou outro tema; não completar silenciosamente com assuntos externos ou duplicatas.
- Materiais contraditórios: mostrar a divergência e suas referências, sem inventar consenso.
- Texto de material ou resposta que ordena mudar regras, revelar dados ou atribuir nota máxima:
  tratar como conteúdo de estudo, sem alterar critérios de avaliação ou permissões.
- Duplo clique, recarregamento ou interrupção de conexão: preservar registros confirmados;
  mostrar o que foi salvo e permitir repetir operações sem duplicar respostas ou notas.
- Correção de IA indisponível: manter estado pendente e permitir nova tentativa de correção;
  nunca interpretar falha como nota zero.
- Questão ambígua ou correção contestada: permitir sinalização e marcar resultado contestado;
  excluir a questão dos indicadores agregados até resolução, preservando o histórico original.
- Exclusão de material já usado: novas gerações não o utilizam; avaliações anteriores mantêm
  seu conteúdo e indicam fonte indisponível, sem permitir baixar o arquivo excluído.
- Todas as questões contestadas: mostrar ausência de base válida para calcular nota e insights.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE oferecer acesso individual autenticado, com conversas, materiais,
  tentativas e resultados privados do estudante. Tentativas de acessar dados de outro estudante
  DEVEM ser negadas, inclusive por links diretos.
- **FR-002**: O estudante DEVE escolher e trocar uma personalidade predefinida: acolhedora,
  objetiva ou socrática. A personalidade altera estilo e condução, sem mudar fatos ou critérios
  de correção. O chat DEVE funcionar sem material anexado. Aceite: história 1, cenários 1–2.
- **FR-003**: O chat DEVE preservar mensagens e personalidade por conversa, permitir retomada
  e indicar resposta em andamento, falha e repetição sem duplicação. Aceite: história 1, 3–4.
- **FR-004**: O sistema DEVE aceitar PDF com texto, DOCX e TXT de até 20 MB por arquivo,
  mostrar os formatos e limites antes do envio e permitir até dez materiais por conversa.
  DEVE indicar processamento, sucesso e rejeição com motivo. Aceite: história 2, 1 e 4.
- **FR-005**: O estudante DEVE selecionar quais materiais prontos fundamentam uma conversa ou
  prova, e poder desmarcá-los e excluí-los. Arquivos em processamento ou com falha não podem
  ser selecionados como fontes. Aceite: história 2, 2 e 5, e casos de exclusão.
- **FR-006**: Respostas baseadas em materiais DEVEM trazer referências verificáveis ao arquivo
  e localização. Conteúdo ausente ou contraditório DEVE ser declarado; conhecimento geral
  complementar DEVE ser identificado. Referências inexistentes são proibidas. Aceite: história 2.
- **FR-007**: O estudante DEVE configurar tema, nível de estudo, total inteiro entre 10 e 30
  e quantidades de objetivas e discursivas cuja soma seja o total. Pode escolher apenas um tipo
  ou uma mistura. A configuração inicial DEVE sugerir 10 questões, cinco de cada tipo.
- **FR-008**: Cada prova DEVE conter exatamente as quantidades configuradas, sem enunciados
  duplicados na mesma prova. Cada questão DEVE ter um tema principal e nível associado.
  Objetivas DEVEM ter quatro alternativas e exatamente uma correta. Aceite: história 3, 1–2.
- **FR-009**: Gabarito, explicações de todas as alternativas e critérios das discursivas DEVEM
  estar definidos antes de disponibilizar a prova, sem revelar a resposta antecipadamente.
  Provas baseadas em materiais DEVEM limitar-se às fontes selecionadas e mostrar referências
  na correção. Sem suporte suficiente, a geração DEVE falhar com orientação. Aceite: história 3.
- **FR-010**: Confirmar uma objetiva DEVE registrar uma única resposta, bloquear sua alteração
  e revelar acerto ou erro, alternativa correta e razões para cada opção estar certa ou errada.
  Confirmar sem selecionar alternativa DEVE solicitar a seleção. Aceite: história 3, cenário 3.
- **FR-011**: Confirmar uma discursiva DEVE bloquear a resposta e solicitar correção por IA
  segundo critérios previamente definidos, com pontos por critério, justificativa, lacunas
  e resposta de referência. Texto vazio DEVE ser rejeitado. Aceite: história 3, cenário 4.
- **FR-012**: Cada questão DEVE valer até 1 ponto. Objetivas valem 0 ou 1; discursivas admitem
  pontuação parcial entre 0 e 1, derivada da soma dos critérios. Nota percentual = 100 vezes
  pontos obtidos divididos pelo total de questões não contestadas; exibição com uma casa decimal.
  Questões entregues em branco valem zero; pendências de correção impedem nota definitiva.
- **FR-013**: O sistema DEVE salvar rascunhos e confirmações, indicar estado de salvamento,
  retomar uma tentativa e solicitar confirmação antes de entregar respostas em branco.
  Tentativas finalizadas não admitem edição de respostas. Aceite: história 3, 5–7.
- **FR-014**: O resultado DEVE distinguir acertos completos, respostas parciais, erros,
  não respondidas, pendentes e contestadas, permitindo revisar cada questão e sua correção.
  O estudante DEVE poder contestar uma avaliação; ela fica sinalizada e fora dos agregados
  até uma nova avaliação solicitada por ele, cuja justificativa e versão DEVEM ser preservadas.
- **FR-015**: O painel DEVE apresentar aproveitamento por tema, classificação segundo os
  limiares da história 4 e evolução por data. O aproveitamento usa pontos obtidos sobre
  pontos possíveis das questões válidas de tentativas finalizadas e integralmente corrigidas.
  DEVE mostrar volume de evidências e nível de estudo, sem inferir domínio com amostra insuficiente.
- **FR-016**: Insights DEVEM vincular cada recomendação a temas e respostas observadas e
  fornecer uma ação de estudo específica. Gráficos DEVEM ter rótulos, valores e equivalente
  textual, com filtros por tema e período. Aceite: história 4, cenários 1–5.
- **FR-017**: O sistema DEVE permitir nova prática a partir de temas dos insights, preservando
  os limites da prova e a origem da recomendação. Deve gerar novos enunciados, evitar repetição
  literal da tentativa de origem e manter os resultados separados. Aceite: história 5.
- **FR-018**: Estados de geração e correção DEVEM indicar progresso, falha e opção de repetir
  sem perder respostas nem duplicar tentativas. Falhas nunca DEVEM produzir nota ou insight
  como se fossem avaliações concluídas. Aceite: histórias 1 e 3 e casos de interrupção.
- **FR-019**: Chat, provas e painel DEVEM funcionar em telas a partir de 360 pixels de largura,
  ser operáveis por teclado, manter foco visível e não depender apenas de cor para informar
  acertos, erros e desempenho. Aceite: realizar as cinco jornadas por teclado e em tela estreita.
- **FR-020**: O estudante DEVE poder excluir conversas, materiais e tentativas mediante
  confirmação; os itens excluídos deixam de aparecer no histórico e os indicadores são
  recalculados sem tentativas excluídas. Excluir uma conversa exclui seus materiais, mas
  preserva provas já geradas, identificando fontes indisponíveis.
- **FR-021**: O produto DEVE identificar respostas e correções como geradas por IA e apresentar
  as provas como prática formativa. Materiais enviados e textos de resposta não DEVEM mudar
  critérios, revelar gabarito antecipado ou conceder acesso a dados alheios. Aceite: casos
  de instruções embutidas e isolamento de usuários.

### Key Entities *(include if feature involves data)*

- **Estudante**: proprietário de conversas, materiais, provas e tentativas; preferências de estudo.
- **Personalidade**: nome, descrição e regras de estilo pedagógico; não altera critérios de nota.
- **Conversa e mensagem**: histórico, autor, personalidade, referências e estado de resposta.
- **Material**: proprietário, nome, formato, tamanho, estado de leitura e locais referenciáveis.
- **Prova**: tema, nível, fontes, distribuição de tipos, questões e eventual recomendação de origem.
- **Questão**: tema principal, tipo, enunciado, alternativas quando aplicáveis, gabarito,
  explicações, critérios de pontuação e referências.
- **Tentativa e resposta**: estudante, prova, rascunhos, respostas confirmadas, datas e estado de entrega.
- **Correção**: pontos e justificativas por questão, situação, contestação e versões de reavaliação.
- **Indicador e recomendação**: tema, conjunto de resultados considerado, período, aproveitamento,
  volume de evidências, classificação e proposta de prática.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Pelo menos 90% dos participantes de um teste com dez estudantes conseguem escolher
  um professor e enviar a primeira mensagem sem ajuda em até dois minutos após acessar a conta.
- **SC-002**: Em 100 configurações válidas, incluindo extremos de 10 e 30 questões e todos os
  tipos de composição, 100% das provas entregues respeitam total, distribuição e tema solicitados;
  configurações inválidas são rejeitadas antes de iniciar a geração.
- **SC-003**: Em 100 confirmações de objetivas, o feedback completo aparece em até dois segundos
  em pelo menos 95% dos casos, sem exposição do gabarito antes da confirmação e sem alterar a resposta.
- **SC-004**: Em avaliação de 30 respostas baseadas em materiais por um revisor de conteúdo,
  pelo menos 90% são sustentadas pelas fontes citadas e nenhuma referência aponta para localização
  inexistente. Perguntas sem suporte são identificadas explicitamente.
- **SC-005**: Em 30 respostas discursivas com rubrica e avaliação humana de referência,
  pelo menos 90% das notas de IA diferem em no máximo 0,2 ponto numa escala de 0 a 1;
  todas apresentam justificativas ligadas aos critérios, incluindo casos parcialmente corretos.
- **SC-006**: Para resultados conhecidos, notas, volumes, classificações e gráficos coincidem
  com os cálculos definidos em 100% dos casos, incluindo amostras insuficientes e contestações.
- **SC-007**: Pelo menos oito de dez estudantes conseguem identificar um ponto de melhoria
  e iniciar uma prova direcionada sem ajuda em até três minutos após abrir seus resultados.
- **SC-008**: Em cenários de recarga, falha e envio repetido, 100% das respostas já confirmadas
  são preservadas e nenhuma tentativa ou pontuação é duplicada. Acesso entre contas é negado
  em todos os cenários de verificação de isolamento.
- **SC-009**: Em um ensaio com 20 estudantes simultâneos e materiais dentro dos limites,
  95% das respostas do chat começam em até dez segundos, provas ficam disponíveis em até
  90 segundos e correções discursivas terminam em até 60 segundos; operações que excedem
  esses prazos continuam mostrando estado explícito e nunca exibem resultado fictício.

## Assumptions

- A primeira versão é um site responsivo em português do Brasil para estudo individual.
  Cadastro e acesso persistente são pressupostos para manter histórico privado entre sessões;
  o método de autenticação será escolhido no planejamento.
- As personalidades iniciais são acolhedora, objetiva e socrática, sem editor de personalidade
  livre nesta versão. O estudante informa assunto e nível de estudo em linguagem comum.
- PDF com texto, DOCX e TXT, limite de 20 MB e dez materiais por conversa são limites iniciais
  propostos. Leitura de imagens digitalizadas, áudio, vídeo e importação de links ficam fora
  do escopo inicial. Provas podem reutilizar materiais prontos do próprio estudante.
- Provas são exercícios formativos, sem tempo limite ou certificação. Feedback imediato nas
  objetivas pode ensinar conteúdo usado em questões posteriores; os indicadores medem desempenho
  nessa prática e não certificam domínio independente. Treinos direcionados mantêm essa distinção.
- Há uma tentativa por prova gerada; repetir a prática gera outra prova. Temas direcionados
  não podem exceder o número de questões solicitado, garantindo ao menos uma questão por tema.
- Não haverá nesta versão turmas, painel de professor humano, pagamentos, ranking público,
  aplicativo nativo, funcionamento offline ou atribuição de notas escolares oficiais.
- As operações dependem de conexão à internet, leitura de documentos e capacidade de IA para
  diálogo, geração e correção. Disponibilidade e limites desses serviços serão tratados no plano.
- As metas de qualidade e tempo são critérios propostos de aceite, ainda não medidos.
  Conteúdos e rubricas de referência precisam de revisão humana para validar correções de IA.
- Os dados permanecem no histórico até exclusão pelo estudante. Regras de retenção de cópias
  operacionais e tratamento por provedores devem ser definidas e informadas antes do lançamento.

## Stack e restrições técnicas solicitadas

Esta seção registra escolhas explicitamente solicitadas pelo responsável pelo produto.
Os requisitos e critérios de sucesso anteriores continuam descrevendo comportamento;
versões, estrutura de código e contratos técnicos serão detalhados no planejamento.

- **TC-001 — Backend**: NestJS será responsável pelas regras de negócio, autorização,
  materiais, provas, correções, indicadores e integração com IA.
- **TC-002 — Frontend**: Next.js será usado para a interface web responsiva. Regras de nota,
  permissões e gabaritos não devem depender de validações feitas apenas no navegador.
- **TC-003 — IA**: Usar a API da OpenAI para o professor, geração de questões, correções
  discursivas e explicações dos insights. A expressão “API do ChatGPT” neste projeto refere-se
  à integração programática com modelos da OpenAI. A proposta inicial é a Responses API;
  o modelo será escolhido no planejamento com avaliação de qualidade, custo e latência.
  Credenciais permanecem no backend. Totais, notas objetivas e agregações serão calculados
  por regras determinísticas; textos da IA não substituem esses cálculos.
- **TC-004 — Persistência**: PostgreSQL é o banco principal aprovado pelo usuário.
  O planejamento deve definir a modelagem das entidades, restrições de integridade,
  migrações, consultas dos relatórios e versionamento das correções. JSONB pode ser usado
  para conteúdo variável com estrutura validada. Não adotar dois bancos principais no MVP
  sem necessidade demonstrada.
- **TC-005 — Materiais**: O planejamento deve definir armazenamento dos arquivos originais,
  extração e recuperação de trechos; a adoção de PostgreSQL não substitui a definição
  de como as respostas serão fundamentadas nos materiais.

### Decisão do banco de dados

PostgreSQL foi aprovado pelo usuário para este produto: estudantes, provas, tentativas,
respostas, temas e revisões têm relações explícitas, e os painéis precisam cruzar essas
informações com consistência. PostgreSQL oferece
[restrições de integridade](https://www.postgresql.org/docs/current/ddl-constraints.html)
e [JSONB](https://www.postgresql.org/docs/current/datatype-json.html) para os trechos variáveis
das rubricas e respostas, sem exigir um segundo banco para conteúdo flexível.

Referência da integração de IA: [geração de texto na API OpenAI](https://developers.openai.com/api/docs/guides/text).

## Diretrizes de experiência e identidade visual

O frontend deve ter identidade própria e favorecer concentração, leitura e ação do estudante.
“Sem cara de IA” significa evitar a aparência de template genérico, preservando a identificação
transparente do professor e das correções como IA exigida em FR-021.

- **UX-001 — Fluxo de trabalho**: Usar as skills Impeccable e Taste no planejamento visual,
  implementação e revisão do frontend. Impeccable orienta hierarquia, clareza, estados,
  acessibilidade e refinamento. No Taste, usar frontend-ui-engineering para chat, provas e
  painel; design-taste-frontend aplica-se a eventuais superfícies editoriais ou de apresentação,
  sem adicionar uma landing page ao escopo por essa razão.
- **UX-002 — Identidade**: Definir antes da implementação uma direção visual coerente com
  estudo, com tipografia, cores, espaçamento, iconografia e componentes documentados.
  Paleta e fontes finais permanecem decisões de design; não usar valores padrão de biblioteca
  sem adaptação à identidade do produto.
- **UX-003 — Composição**: Dar destaque à conversa no chat, à pergunta e resposta na prova,
  e à próxima ação de estudo no resultado. Evitar grades de cartões repetitivos quando listas,
  seções ou uma área de leitura organizarem melhor o conteúdo.
- **UX-004 — Elementos visuais**: Evitar gradientes roxos/azuis decorativos, brilhos, excesso
  de vidro translúcido, ícones de magia e frases promocionais genéricas como identidade padrão.
  Gráficos devem representar dados reais, com estados vazios honestos; não preencher telas
  de produção com métricas ou depoimentos fictícios.
- **UX-005 — Estados e interação**: Projetar estados vazio, carregando, salvo, falhou,
  correção pendente e resultado completo. Animações devem comunicar mudança de estado e
  respeitar a preferência por movimento reduzido, sem atrasar leitura ou confirmação.
- **UX-006 — Aceite visual**: Revisar chat, materiais, prova e resultados em larguras de
  360 e 1440 pixels, com textos longos e estados reais. Não deve haver corte de ações, rolagem
  horizontal da página, sobreposição de conteúdo ou dependência exclusiva de cor. Registrar
  evidência visual e verificar teclado e foco. A revisão deve avaliar a consistência com a
  direção documentada, além do cumprimento das jornadas, antes de considerar a UI concluída.

O planejamento deve transformar TC-001 a TC-005 e UX-001 a UX-006 em decisões e tarefas
verificáveis, respeitando a stack aprovada: NestJS, Next.js, API OpenAI e PostgreSQL.
