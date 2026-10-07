# Skills educacionais e GPT-6 Luna

Pedido: 2026-10-01. Reaproveitar a pedagogia do EduClaude e melhorar respostas curtas/superficiais.

## User stories

### US1 — Aprender com profundidade (P1)
O estudante recebe uma explicação com intuição, conceitos, exemplo resolvido, justificativa dos passos, limites e verificação de compreensão, adequada à pergunta. Pedidos pontuais não viram aulas artificiais.
- AC1: conversas novas e existentes começam com skill explicar e profundidade aprofundada.
- AC2: resumida, equilibrada e aprofundada alteram orientações e capacidade de saída; o limite global continua prevalecendo.
- AC3: GPT-6 Luna usa Responses com saída estruturada e configurações suportadas; não há fallback silencioso para nano.
- AC4: um resumo completo de R básico, com vários exemplos pequenos, recebe a aula pedida; exemplos independentes e fórmulas não são confundidos com uma aplicação pronta.

### US2 — Escolher como estudar (P1)
O estudante escolhe uma skill no chat: explicar, praticar, revisar ou flashcards, independentemente da personalidade.
- AC1: a seleção tem nome e descrição, funciona por teclado e persiste ao recarregar.
- AC2: cada turno congela skill, versão e profundidade; alterar a conversa não altera um turno em andamento ou sua repetição.
- AC3: prática e revisão esperam a tentativa antes de revelar solução; flashcards são atômicos, com respostas recolhidas e sem prometer agendamento inexistente.

## Functional requirements

- FR-001: catálogo confiável, versionado no servidor e extensível por código; sem executar scripts do EduClaude nem instruções de anexos.
- FR-002: selecionar uma skill e uma profundidade por conversa, validando valores e concorrência/ownership como já existentes.
- FR-003: manter personalidade, fontes e limites educacionais; separação de conhecimento geral/fontes permanece obrigatória.
- FR-004: registrar snapshots por mensagem e retornar metadados de skill/profundidade na API.
- FR-005: usar gpt-6-luna por padrão nas gerações de texto, preservando embeddings e fake nos testes.
- FR-006: orçamento persistente preserva teto, gastos e reservas; adicionar preço do novo modelo não pode modificar preços anteriores nem permitir subcontagem de cache writes.
- FR-007: disponibilizar a versão no staging isolado e verificar uma chamada real se o saldo permitir; relatar qualidade como observação, não certificação.
- FR-008: atribuir a origem MIT do conteúdo educacional adaptado e documentar como adicionar skills, migração e recuperação.
- FR-009: refinar o painel lateral de arquivos mantendo identidade visual, upload, seleção de fontes, download, exclusão, erros e adaptação ao celular; indicar claramente quantas fontes serão consultadas. Pedido adicional do usuário: subagentes e plugins Impeccable/Taste.

## Boundaries

Skills são métodos de ensino usados pelo tutor, não plugins de execução. Nesta entrega flashcards vivem no chat; não há biblioteca persistente de cards nem algoritmo de repetição espaçada. Não há chamadas externas, avaliação oficial, ferramentas ou navegação pelo tutor. O EduClaude é somente fonte de leitura; seus arquivos não serão alterados. As pendências da feature 001 permanecem fora desta mudança.

## Success criteria

- SC-001: testes automatizados provam persistência, snapshots/retry, rejeição de valores hostis e preservação do orçamento.
- SC-002: smoke E2E prova mudança de skill/profundidade e recarga no chat, incluindo apresentação de flashcards.
- SC-003: build, lint, tipos e testes relevantes passam; limitações de teste real são registradas.
