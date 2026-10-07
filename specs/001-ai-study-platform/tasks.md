---
description: "Tarefas de implementação da plataforma de estudos com professor de IA"
---

# Tasks: Plataforma de estudos com professor de IA

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/` e `quickstart.md`.
**Tests**: Obrigatórios para regras de negócio, contratos e jornadas, conforme a constituição do projeto.
**Organization**: Fases por história; cada fase termina com um incremento verificável.

## Formato

`[ID] [P?] [Story?] Descrição com caminho`. `[P]` indica arquivos independentes na mesma fase. Os caminhos são relativos à raiz do repositório.

## Phase 1: Setup

**Goal**: Monorepo reproduzível, serviços locais e gates de qualidade.

- [X] T001 Fixar Node.js 24 LTS, pnpm 10, workspaces e scripts de build/format/lint/typecheck/test em `package.json`, `pnpm-workspace.yaml` e `.npmrc`.
- [X] T002 [P] Configurar TypeScript estrito ESM, Vitest, ESLint e Prettier em `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.mjs` e `.prettierrc.json`.
- [X] T003 [P] Criar containers PostgreSQL 18 com pgvector e SMTP local limitados a loopback em `infra/compose.yaml` e variáveis sem segredo em `.env.example`.
- [X] T004 Inicializar os pacotes NestJS 12, Next.js 16 e contratos públicos em `apps/api/package.json`, `apps/web/package.json` e `packages/contracts/package.json`; registrar lockfile `pnpm-lock.yaml`.
- [X] T005 Criar CI com format, lint, typecheck, testes e build em `.github/workflows/ci.yml`; documentar instalação e versões em `README.md`.

## Phase 2: Foundational

**Goal**: Autorização, persistência, operações recuperáveis e limites de confiança para todas as histórias.

- [X] T006 Criar migração inicial com UUIDs, owner_id, FKs compostas, índices, estados e exclusão lógica de `data-model.md` em `apps/api/migrations/001_initial.sql` e runner em `apps/api/src/infrastructure/db/migrate.ts`.
- [X] T007 Implementar configuração validada e falha segura de produção com IA fake em `apps/api/src/infrastructure/config.ts` e teste em `apps/api/test/config.spec.ts`.
- [X] T008 Implementar pool PostgreSQL, transações, erros públicos e logging sem conteúdo privado em `apps/api/src/infrastructure/db/`, `apps/api/src/infrastructure/http/` e respectivos testes em `apps/api/test/infrastructure/`.
- [X] T009 Implementar registro/login/logout/reset, Argon2id, sessão opaca de sete dias, CSRF/Origin, rate limit e autorização por owner em `apps/api/src/modules/auth/` e testes de duas contas em `apps/api/test/auth/`.
- [X] T010 Implementar Idempotency-Key UUID por owner/rota, hash do corpo e replay autorizado em `apps/api/src/infrastructure/http/idempotency.ts` e teste concorrente em `apps/api/test/infrastructure/idempotency.spec.ts`.
- [X] T011 Implementar storage privado local/S3, verificação de dono e revogação imediata em `apps/api/src/infrastructure/storage/` e teste em `apps/api/test/storage.spec.ts`.
- [X] T012 Implementar Operation/OperationEvent, dispatcher pg-boss, lease com fence_version, retry limitado, cancelamento e SSE retomável em `apps/api/src/infrastructure/jobs/` e testes de queda/duplicação em `apps/api/test/jobs/`.
- [X] T013 Implementar portas de IA fake/OpenAI Responses com store:false, schemas estritos, orçamento e diagnósticos sanitizados em `apps/api/src/infrastructure/ai/` e testes de saída inválida em `apps/api/test/ai/`.
- [X] T014 Criar DTOs públicos Zod, cliente de API de mesma origem e shell acessível em `packages/contracts/src/`, `apps/web/src/lib/api.ts` e `apps/web/src/app/`.

**Checkpoint**: Banco, sessão, proteção HTTP e jobs passam testes de isolamento e recuperação.

## Phase 3: User Story 1 — Professor personalizado (P1, MVP)

**Goal**: Chat sem material, personalidade mutável e retomada privada.
**Independent Test**: V01–V02 de `quickstart.md`, com duas contas e timeout injetado.

- [X] T015 [P] [US1] Criar catálogo versionado das três personalidades e snapshots sem alterar critérios em `apps/api/src/modules/conversations/personalities.ts` e teste em `apps/api/test/conversations/personalities.spec.ts`.
- [X] T016 [US1] Implementar CRUD de conversas/mensagens, versionamento, turno único, proprietário e exclusão em `apps/api/src/modules/conversations/` e testes HTTP em `apps/api/test/conversations/`.
- [X] T017 [US1] Implementar envio atômico de pergunta/operação, resposta fake/OpenAI, retry da mesma pergunta e histórico filtrado em `apps/api/src/modules/conversations/chat.service.ts` e testes de falha em `apps/api/test/conversations/chat.spec.ts`.
- [X] T018 [US1] Criar cadastro, entrada, escolha de personalidade, lista e chat com estados IA/erro/retry em `apps/web/src/app/(study)/conversas/`, `apps/web/src/app/(auth)/` e `apps/web/src/features/chat/`.
- [X] T019 [US1] Testar isolamento, mudança de estilo, retomada e operação por teclado a 360 px em `tests/e2e/chat.spec.ts`.

**Checkpoint**: Professor de IA utilizável sem upload, com histórico privado.

## Phase 4: User Story 2 — Materiais próprios (P2)

**Goal**: Upload privado e respostas com referências verificáveis.
**Independent Test**: V03–V04, com PDF textual, DOCX, TXT e fontes ausentes/contraditórias.

- [X] T020 [US2] Implementar reserva de até dez materiais ativos por conversa, streaming até 20.000.000 bytes, detecção de formato e exclusão em `apps/api/src/modules/materials/materials.service.ts` e testes HTTP em `apps/api/test/materials/upload.spec.ts`.
- [X] T021 [P] [US2] Extrair PDF por página, DOCX por parágrafo e TXT por linha; rejeitar vazio, senha e UTF-8 inválido em `apps/api/src/modules/materials/extract.ts` e fixtures/testes em `apps/api/test/materials/extract.spec.ts`.
- [X] T022 [US2] Criar trechos/embeddings e recuperação filtrada por dono, fontes ativas e versões em `apps/api/src/modules/materials/retrieval.ts` e testes em `apps/api/test/materials/retrieval.spec.ts`.
- [X] T023 [US2] Implementar seleção atômica de fontes prontas, citações validadas, ausência de suporte, conflitos e invalidação após exclusão em `apps/api/src/modules/conversations/sources.service.ts` e `apps/api/test/conversations/sources.spec.ts`.
- [X] T024 [US2] Criar painel de upload, estados, seleção, referências e exclusão em `apps/web/src/features/materials/` e integrar ao chat em `apps/web/src/app/(study)/conversas/[id]/page.tsx`.
- [X] T025 [US2] Testar limites, formatos, localização das citações e remoção de fonte em `tests/e2e/materials.spec.ts`.

**Checkpoint**: Fonte excluída não fundamenta respostas novas nem fica disponível para download.

## Phase 5: User Story 3 — Prova e correção (P2)

**Goal**: Prova exata de 10–30 questões, tentativa durável e correção fundamentada.
**Independent Test**: V05–V12, incluindo gabarito oculto, disputa, retry e concorrência.

- [X] T026 [P] [US3] Validar configuração: total inteiro 10..30, contagens inteiras não negativas com soma exata, temas 1..total, nível/tema até 200 caracteres e até dez fontes prontas em `apps/api/src/modules/exams/exam-config.ts` e `apps/api/test/exams/exam-config.spec.ts`.
- [X] T027 [US3] Implementar geração a partir do contexto de conversa, schemas privados, quatro opções/uma correta, rubrica inteira somando 10.000, referências, temas e publicação atômica em `apps/api/src/modules/exams/` e `apps/api/test/exams/generation.spec.ts`.
- [X] T028 [US3] Criar DTO QuestionPublic e endpoints que nunca serializam gabarito/rubrica antes da confirmação em `packages/contracts/src/exams.ts`, `apps/api/src/modules/exams/exams.controller.ts` e `apps/api/test/exams/secrecy.spec.ts`.
- [X] T029 [US3] Implementar rascunhos com versão otimista, confirmação imutável e nota objetiva 0/10.000 com feedback de quatro alternativas em `apps/api/src/modules/attempts/` e testes concorrentes em `apps/api/test/attempts/`.
- [X] T030 [US3] Implementar correção discursiva por critérios fixos, soma server-side 0..10.000, pendência/falha/retry e revisões imutáveis em `apps/api/src/modules/grading/` e `apps/api/test/grading/`.
- [X] T031 [US3] Implementar entrega confirmada, zeros de brancas, nota half-up apenas na exibição, resultado provisório e disputa/reavaliação em `apps/api/src/modules/attempts/submission.service.ts`, `apps/api/src/modules/grading/disputes.service.ts` e respectivos testes.
- [X] T032 [US3] Criar configuração de prova com padrão 10/5/5, progresso e falha em `apps/web/src/app/(study)/provas/nova/` e `apps/web/src/features/exams/`.
- [X] T033 [US3] Criar tentativa com autosave, confirmação separada, feedback, entrega com aviso e revisão de resultados em `apps/web/src/app/(study)/tentativas/` e `apps/web/src/features/attempts/`.
- [X] T034 [US3] Testar extremos, segredo, rascunho, duplo clique, correção parcial e disputa em `tests/e2e/exams.spec.ts` e `tests/contract/exams.spec.ts`.

**Checkpoint**: Cada questão vale no máximo 1 ponto e falha de IA nunca vira zero.

## Phase 6: User Story 4 — Resultados e evolução (P3)

**Goal**: Indicadores calculados apenas de evidência elegível e prática orientada.
**Independent Test**: V11–V13 com notas conhecidas, disputas, filtros e níveis distintos.

- [X] T035 [P] [US4] Implementar cálculo puro por unidades, exclusão de contestadas, mínimo de três evidências e limiares brutos <60, <80 e >=80 em `apps/api/src/modules/insights/calculation.ts` e fixtures/testes em `apps/api/test/insights/calculation.spec.ts`.
- [X] T036 [US4] Implementar consultas por tema/período [início,fim)/timezone e séries separadas por nível, excluindo tentativas incompletas/deletadas em `apps/api/src/modules/insights/insights.service.ts` e testes SQL em `apps/api/test/insights/insights.integration.spec.ts`.
- [X] T037 [US4] Implementar recomendações vinculadas a IDs de respostas/revisões elegíveis, fallback determinístico quando IA falhar e invalidação por exclusão/contestação em `apps/api/src/modules/insights/recommendations.service.ts` e testes.
- [X] T038 [US4] Criar `/evolucao` e resultado com filtros na URL, gráfico rotulado, tabela equivalente, estados vazios/pendentes e evidências em `apps/web/src/app/(study)/evolucao/`, `apps/web/src/app/(study)/tentativas/[id]/resultado/` e `apps/web/src/features/insights/`.
- [X] T039 [US4] Testar filtros, 59,99/60/79,99/80%, amostra insuficiente e exclusões em `tests/e2e/insights.spec.ts`.

**Checkpoint**: Sem base válida retorna nota null e explicação, nunca zero fabricado.

## Phase 7: User Story 5 — Prática dirigida (P3)

**Goal**: Nova tentativa para temas recomendados, com origem rastreável.
**Independent Test**: V14, cobrindo seleção múltipla, repetição literal e tentativas separadas.

- [X] T040 [US5] Validar recomendação atual, temas pertencentes, temas <= questões e fontes ativas; guardar origem e hashes a evitar em `apps/api/src/modules/insights/practice.service.ts` e `apps/api/test/insights/practice.spec.ts`.
- [X] T041 [US5] Reutilizar geração de prova com ao menos uma questão por tema, novos enunciados e nova tentativa em `apps/api/src/modules/exams/exam-generation.service.ts` e `apps/api/test/exams/practice-generation.spec.ts`.
- [X] T042 [US5] Ligar “Praticar este tema” à configuração preenchida 10/5/5, preservando origem em `apps/web/src/features/insights/PracticeAction.tsx` e `apps/web/src/app/(study)/provas/nova/page.tsx`.
- [X] T043 [US5] Testar jornada de resultado à prática e preservação da prova anterior em `tests/e2e/practice.spec.ts`.

**Checkpoint**: Nova avaliação aparece separada e alimenta o histórico após correção.

## Phase 8: Polish & cross-cutting

**Goal**: Operação, acessibilidade, segurança e evidência de aceite.

- [X] T044 Implementar exclusão/retention com DeletionRecord, purga até 24 h, revogação imediata, restore e limpeza de SSE em `apps/api/src/infrastructure/deletion/` e `apps/api/test/deletion/`.
- [X] T045 [P] Completar rotas e estados de recuperação de senha, sessão expirada e exclusões com confirmação em `apps/web/src/app/(auth)/` e `apps/web/src/features/settings/`.
- [X] T046 Criar tokens visuais, PRODUCT.md e DESIGN.md, validar contraste e teclado nos cinco fluxos em `apps/web/src/styles/`, `PRODUCT.md`, `DESIGN.md` e `tests/e2e/accessibility.spec.ts`.
- [X] T047 Testar V01–V18 com fake, banco isolado e fixtures sintéticas; adicionar scripts e setup do Playwright em `tests/e2e/`, `tests/fixtures/` e `package.json`.
- [X] T048 [P] Criar corpus de avaliação humana com orçamento explícito e relatório de custo/latência para SC-004/005 em `tests/evaluations/` e script `test:evaluations` em `package.json`.
- [X] T049 [P] Criar ensaio k6 de 20 usuários, fake e real, incluindo timeouts em p95 em `tests/load/` e script `test:load` em `package.json`.
- [X] T050 Documentar migrações, backup/restore, retenção, variáveis, operação e limitações reais em `README.md` e `docs/operations.md`.
- [X] T051 Executar format, lint, typecheck, unit, integration, contract, e2e, build e validação visual; registrar resultados e pendências verificáveis em `specs/001-ai-study-platform/validation.md`.

## Dependencies & execution order

1. Setup T001–T005 precede Foundation T006–T014.
2. Foundation precede todas as histórias. US1 pode ser entregue como MVP após T015–T019.
3. US2 requer chat da US1; US3 requer uma conversa da US1 com pergunta concluída, e T020–T023 para provas com fontes.
4. US4 requer notas e revisões da US3. US5 requer recomendações da US4 e geração da US3.
5. T044–T051 concluem retenção, UX, evidência e documentação após as jornadas afetadas.

## Parallel examples

- Setup: T002 e T003 tratam configurações independentes.
- US1: T015 (catálogo) pode começar enquanto a API de conversas T016 é estruturada.
- US2: T021 (extrator puro) pode avançar enquanto T020 cuida do upload.
- US3: T026 (validador) pode ser implementada antes da integração da geração T027.
- US4: T035 (cálculo puro) independe da consulta SQL T036 até sua integração.
- Polish: T048 e T049 geram instrumentos distintos de avaliação.

## Implementation strategy

Entregar primeiro Setup + Foundation + US1; validar V01–V02. Acrescentar materiais, provas, evolução e prática em ordem, verificando cada checkpoint. CI usa IA fake determinística. Ensaios reais exigem staging, chave e orçamento explícito e não devem ser declarados aprovados sem medições.

## Phase 9: Convergence

- [X] T052 Adicionar testes de regressão com instruções hostis em mensagens, materiais e respostas, verificando que permissões, gabaritos e critérios de correção permanecem inalterados em `apps/api/test/ai/` e `apps/api/test/exams/` per FR-021 (missing)

## Phase 10: Convergence

- [X] T053 Executar integração, contrato e E2E como gates no CI, com PostgreSQL isolado, migrações, Edge e IA fake, em `.github/workflows/ci.yml` e `playwright.config.ts` per Constitution Quality Standards (partial).
- [ ] T054 Medir separadamente início da resposta do chat, disponibilidade da prova, término da correção discursiva e feedback objetivo nos limites SC-003/009, contabilizando timeouts e custo do modo real, em `tests/load/study.js` e `docs/operations.md` per SC-003/SC-009 (partial).
- [ ] T055 Criar execução e relatório de avaliação real para pelo menos 30 respostas com fontes e 30 correções discursivas com notas humanas, localizadores, latência, custo e teto operacional, em `tests/evaluations/` per SC-004/SC-005 (partial).
- [ ] T056 Cobrir axe, teclado e 360/768/1024/1440 px nos cinco fluxos, estados vazio/erro/pendente e registrar a conferência manual de leitor de tela em `tests/e2e/accessibility.spec.ts` e `specs/001-ai-study-platform/validation.md` per FR-019/plan: UX evidence (partial).
- [ ] T057 Exercitar desligamento/reinício físico do worker, backup/restore isolado com journal de exclusões e indisponibilidade temporária do storage, registrando evidências em `tests/operations/` e `docs/operations.md` per V16/V18/plan: recovery (partial).
- [X] T058 Atualizar `specs/001-ai-study-platform/quickstart.md` para comandos e estado atuais, distinguindo testes locais aprovados de ensaios reais pendentes, per Constitution V (contradicts).

## Phase 11: Ajustes solicitados

- [X] T059 Configurar modelos OpenAI de baixo custo para chat, provas, correção e insights, mantendo embedding econômico e segredos fora do repositório, em `apps/api/src/infrastructure/ai/provider.ts`, `.env.example` e `specs/001-ai-study-platform/plan.md`.
- [X] T060 Revisar as superfícies da entrada, navegação, conversas e respostas, com movimento discreto e respeito a `prefers-reduced-motion`, em `apps/web/src/app/globals.css`.

**Dependências**: T059 depende da fundação de IA T013; T060 depende da UI T014/T046. Podem avançar em paralelo. A revisão humana e os ensaios de staging T054–T057 continuam independentes desses ajustes.

## Phase 12: Chat, design e execução local solicitados

- [X] T061 Refazer todas as páginas com shadcn/ui, Magic UI e Motion, incluindo chat com menu de professor, arquivos à direita e revisão dos textos; registrar em `docs/frontend-design-review.md`.
- [X] T062 Aceitar materiais Markdown e renderizar respostas com títulos, tabelas, código copiável e diagramas Mermaid seguros no chat.
- [X] T063 Integrar OpenAI real com modelo econômico, personalidades validadas e limites de foco educacional no servidor; registrar testes em `docs/chat-markdown-and-safety.md`.
- [X] T064 Preparar Docker Compose para web, API, worker, migrações, PostgreSQL e SMTP, com segredos somente em runtime; documentar em `docs/docker.md`.
- [X] T065 Concluir testes de navegador, acessibilidade e build das páginas alteradas, registrando resultados e mantendo a prévia disponível.

**Dependências**: T063 usa T062 e a fundação de IA. T064 pode avançar em paralelo. T065 valida a integração das alterações. Os ensaios de staging e revisões humanas anteriores permanecem pendentes.

- [X] T066 Adicionar arrastar e soltar arquivos na conversa, envio em lote, validação compartilhada, recuperação com idempotência e regressões desktop/mobile em MaterialsPanel e tests/e2e/materials.spec.ts.

## Phase 13: Instrumentos executáveis de validação

**Input**: Regeneração por `speckit-tasks` em 01/10/2026, preservando IDs, fases e evidências anteriores. T054–T057 permanecem abertas até o aceite externo; tarefas abaixo completam suas partes automatizáveis.
**Goal**: Produzir instrumentos reproduzíveis, sem confundir IA fake com qualidade pedagógica ou revisão humana.

- [X] T067 Corrigir observações de falha/timeout, contagem mínima de 20 chats/provas/discursivas e 180 objetivas e relatório separado por fase em `tests/load/study.js`; adicionar regressões em `tests/load/measurement.spec.mjs` per T054/SC-003/SC-009.
- [X] T068 [US2] Criar coletor de 30 respostas com fontes e 30 discursivas usando o provider real, com custo por tokens, teto antes de cada chamada, latência, modelo/schema e campos humanos vazios em `tests/evaluations/collect.ts`, `tests/evaluations/samples.ts` e `apps/api/src/infrastructure/ai/provider.ts` per T055/SC-004/SC-005.
- [X] T069 [US3] Testar orçamento, localizadores, soma por critérios e rejeição de revisões incompletas, incluindo limites de concordância, em `apps/api/test/ai/evaluation.spec.ts` e `tests/evaluations/score.spec.mjs` per T055/Constitution III–IV.
- [X] T070 [US3] Cobrir tentativa e resultado em 360/768/1024/1440 px com axe, foco e ações por teclado em `tests/e2e/exams.spec.ts`; documentar roteiro humano em `tests/operations/accessibility.md` per T056/FR-019/UX-006.
- [X] T071 Automatizar interrupção física de processo worker e backup/restore de PostgreSQL isolado com journal de exclusões e falha temporária de storage local em `tests/operations/` per T057/V16/V18; preservar o aceite de S3 externo como pendente.
- [X] T072 Executar verificações aplicáveis, registrar evidência atual e atualizar comandos/limites em `specs/001-ai-study-platform/validation.md`, `specs/001-ai-study-platform/quickstart.md`, `tests/evaluations/README.md` e `docs/operations.md` per Constitution V.

**Independent tests**: US2: coletor valida 30 fontes e localizadores sem aceitar suporte humano inventado. US3: rubricas somam 10.000 unidades, pontuação fica em 0..1, revisões humanas incompletas falham e prova/resultado passam quatro larguras. US1/US4/US5 mantêm V01–V02/V11–V14 como aceite independente das fases anteriores.

**Dependencies**: T067 usa T049; T068 usa T013/T021/T030; T069 depende de T068; T070 usa T034/T046; T071 usa T012/T044; T072 depende de T067–T071. T054–T057 exigem também ambiente/revisões externos documentados, não são concluídas apenas por preparar instrumentos.

**Parallel examples**: T067 (carga), T070 (E2E) e T071 (operação) tratam arquivos distintos; T068 e T069 são sequenciais. US5 não tem tarefa paralela independente: a prática depende de geração e recomendações. Nesta execução não há delegação.

**Implementation strategy**: Manter o MVP US1 e o histórico T001–T066, concluir instrumentos e regressões locais, executar gates e então `speckit-converge`. Ensaios reais só com staging e teto explícito; julgamentos humanos permanecem vazios até revisão.

## Phase 14: Staging e avaliação autorizados

**Input**: Usuário autorizou staging isolado e teto total de US$ 0,20 nesta sessão; pediu revisão pelo próprio agente. Revisão do agente deve ser identificada como automatizada e não satisfaz requisito de revisor humano da especificação.

- [X] T073 Criar staging isolado com banco/arquivos sintéticos e portas loopback, sem interferir na stack existente, em `infra/compose.staging.yaml` e `docs/staging.md`.
- [X] T074 Implementar trava de orçamento compartilhada por chamadas simultâneas do worker, contabilizando reservas e timeouts antes de chamar o provedor, com testes de regressão em `apps/api/src/infrastructure/ai/` e `apps/api/test/ai/`; o total de coleta e staging não pode ultrapassar US$ 0,20.
- [X] T075 Executar coleta real e revisão automatizada dos resultados, registrar tokens/custo/latência e limitações em `tests/evaluations/` e `specs/001-ai-study-platform/validation.md`, sem preencher julgamento humano.
- [X] T076 Executar carga fake e, dentro do saldo autorizado, carga real no staging isolado; registrar p95, falhas, quantidade de observações e saldo do teto em `tests/load/` e `specs/001-ai-study-platform/validation.md`.
- [X] T077 Corrigir o gargalo de fila observado na carga fake (2/20 chats ultrapassam 10 s), permitindo concorrência global validada por tipo de trabalho em `apps/api/src/infrastructure/jobs/dispatcher.ts` e regressões em `apps/api/test/jobs/concurrency.spec.ts` per SC-009/plan: global concurrency.
- [X] T078 Separar a limpeza de evidências E2E de relatórios de operação e coleta paga em `playwright.config.ts`, integrar a coleta ao ledger persistente e preservar o teto após a rodada interrompida em `tests/evaluations/collect.ts` per Constitution III/V.

**Dependencies**: T074 antes de T075–T076; T073 antes da carga; T068/T069 antes da coleta. MVP US1 permanece utilizável. Não há autorização para publicar em produção.

- [ ] T079 Corrigir instruções de basis/chunkIds e impedir exigências de correção além da rubrica/referência, após falhas observadas no ensaio real; testar o contrato das instruções e repetir coleta/carga dentro do mesmo ledger em apps/api/src/infrastructure/ai/, apps/api/test/ai/prompt-safety.spec.ts e tests/evaluations/ per FR-006/FR-012/SC-004/SC-005.

- [X] T080 Explicitar geração sem arquivos e impor distribuição, temas e campos por tipo no schema restrito de provas; usar dúvida educacional concreta na fixture de carga e repetir ensaio no saldo autorizado em apps/api/src/infrastructure/ai/provider.ts, apps/api/test/ai/prompt-safety.spec.ts e tests/load/study.js per FR-007/FR-008/SC-009.

## Phase 15: Convergence

**Assessment**: 01/10/2026, código atual confrontado com spec/plan/tasks e constituição 1.0.0; sem comparação de branches. T054–T057 e T079 continuam abertas. A revisão autorizada pelo agente foi realizada e identificada como tal. As tarefas abaixo detalham lacunas verificadas, sem representar nova autorização de gasto.

- [ ] T081 **CRITICAL** Preservar códigos de falha reconhecidos e contexto sanitizado de operação/request no dispatcher e filtro HTTP, mantendo resposta pública segura e sem prompts/segredos nos logs; reproduzir AI_SOURCE_INVALID/timeout/erro desconhecido em `apps/api/src/infrastructure/jobs/dispatcher.ts`, `apps/api/src/infrastructure/http/public-error.ts` e testes em `apps/api/test/jobs/` e `apps/api/test/auth/` per Constitution Quality Standards: diagnostic context (contradicts).
- [ ] T082 Concluir como falha recuperável uma operação cujo terceiro lease expire, atualizando recurso/eventos e permitindo retry manual na mesma operação; testar três interrupções, fence tardio e efeito único em `apps/api/src/infrastructure/jobs/operations.ts` e `apps/api/test/jobs/operations.integration.spec.ts` per FR-018/US1-AC4/US3-AC7/plan: three executions (partial).
- [ ] T083 [US2] Excluir do prompt histórico apoiado em materiais desmarcados, cruzando versões ativas com o snapshot de fontes da nova pergunta; preservar histórico visível e testar desmarcar/remarcar/excluir em `apps/api/src/modules/conversations/chat.job.ts`, `apps/api/test/conversations/` e `tests/e2e/materials.spec.ts` per FR-005/US2-AC5/plan: AI chat history (contradicts).
- [ ] T084 [US2] Preservar ou representar explicitamente a classificação source/general/unsupported ao persistir e apresentar respostas, sem atribuir citações de um segmento a outro; documentar compatibilidade e testar chat misto em `apps/api/src/modules/conversations/chat.job.ts`, `packages/contracts/src/index.ts`, `apps/web/src/features/chat/` e `tests/e2e/materials.spec.ts` per FR-006/US2-AC2/US2-AC3 (partial).
- [ ] T085 [US2] Corrigir fundamentação semântica, tratamento de divergências e recusa de citação fictícia, usando os casos reais inspecionados como regressões e avaliação repetível; não aprovar apenas IDs válidos e não substituir fontes por conhecimento externo em `apps/api/src/infrastructure/ai/`, `apps/api/test/ai/` e `tests/evaluations/` per FR-006/FR-021/SC-004/T079 (partial).
- [ ] T086 [US3] Corrigir crédito parcial, equivalência à referência e coerência entre unidades/justificativa sem exigir tópicos ausentes da rubrica; reproduzir zero indevido em frações/equações e nota parcial superior à completa em `apps/api/src/infrastructure/ai/provider.ts`, `apps/api/src/modules/grading/`, `apps/api/test/grading/` e `tests/evaluations/` per FR-011/FR-012/US3-AC4/SC-005/T079 (partial).
- [ ] T087 [US4] Fornecer ao provider de insights nomes/agregados e conteúdo mínimo autorizado de questões/respostas/feedback elegíveis, validar ações específicas contra essa evidência e sinalizar fallback/indisponibilidade; testar isolamento, contestação e troca de revisão em `apps/api/src/modules/insights/recommendations.service.ts`, `apps/api/src/infrastructure/ai/provider.ts`, `apps/api/test/insights/` e `apps/web/src/features/insights/` per FR-016/US4-AC1/plan: insights input and fallback (partial).
- [ ] T088 Ajustar latência/capacidade reais de chat e geração, distinguir rejeição de reserva e insuficiência definitiva do teto e executar novamente 20 usuários com as quatro fases completas; incluir upload/extração/recuperação de materiais e orçamento previamente autorizado em `apps/api/src/infrastructure/jobs/dispatcher.ts`, `apps/api/src/infrastructure/ai/`, `tests/load/` e `specs/001-ai-study-platform/validation.md` per SC-009/T054/plan: performance (partial).
- [ ] T089 [US3] Executar e registrar matriz de 100 configurações válidas de provas, cobrindo 10/30, apenas objetivas/apenas discursivas/mistas e vários temas; conferir toda prova publicada e registrar também falhas, sem confundir seis mocks do provider com o ensaio completo, em `apps/api/test/exams/`, `tests/evaluations/` e `specs/001-ai-study-platform/validation.md` per SC-002/FR-008/T026/T027 (partial).
- [ ] T090 [US2] Isolar extração PDF/DOCX em processo com limites de tempo/memória e sem acesso de rede ou filesystem arbitrário; preservar localizadores e estados e testar arquivo hostil, timeout e continuidade de outros jobs em `apps/api/src/modules/materials/extract.ts`, `apps/api/src/modules/materials/extract.job.ts` e `apps/api/test/materials/` per TC-005/plan: materials extraction/research R4 (missing).
- [ ] T091 Concluir avaliação pedagógica com 30 fontes e 30 discursivas revisadas por humano após corrigir a qualidade; incluir perguntas sem suporte e casos parciais/hostis, manter revisão do agente separada e registrar modelo/prompt/custo/latência em `tests/evaluations/` e `specs/001-ai-study-platform/validation.md` per SC-004/SC-005/T055 (partial).
- [ ] T092 Executar roteiro Narrador/NVDA nos cinco fluxos e estados vazio/erro/pendente, incluindo confirmação, salvamento, diálogos e tabela equivalente; registrar anúncios ou defeitos e regressões aplicáveis em `tests/operations/accessibility.md`, `tests/e2e/` e `specs/001-ai-study-platform/validation.md` per FR-019/UX-006/T056 (partial).
- [ ] T093 Ensaiar backup cifrado e restauração do bucket S3 isolado com journal recente, indisponibilidade temporária e medição da purga dentro de 24 h; confirmar acesso revogado e retry sem interpretar filesystem local como S3 em `tests/operations/`, `docs/operations.md` e `specs/001-ai-study-platform/validation.md` per FR-020/T057/V18/plan: recovery and retention (partial).
- [ ] T094 Implementar limites concorrentes por proprietário para uma geração de prova e dois jobs de chat/correção, com decisão atômica entre requisições/processos, erro 429/retry e preservação da idempotência; testar duas contas e chamadas paralelas em `apps/api/src/infrastructure/jobs/`, `apps/api/src/modules/exams/`, `apps/api/src/modules/conversations/`, `apps/api/src/modules/attempts/` e `apps/api/test/` per plan: account concurrency (missing).
- [ ] T095 [US2] Completar busca lexical portuguesa combinada à vetorial, chunking aproximado de 800 tokens com 120 de sobreposição sem cruzar localizadores e seleção de fontes com cobertura por tema de prova; testar proprietário/seleção/versão e temas em arquivos além dos primeiros 100 trechos em `apps/api/src/modules/materials/retrieval.ts`, `apps/api/src/modules/exams/exam.job.ts` e `apps/api/test/materials/` per plan: hybrid retrieval/research R4 (partial).
- [ ] T096 Registrar modelo efetivamente retornado, versões/hash de prompt/schema, providerRequestId, tokens, latência e tentativa por geração/correção/recomendação, inclusive sem ledger de ensaio; adicionar migração compatível e testes sem dados estudantis nos logs em `apps/api/src/infrastructure/ai/`, `apps/api/src/modules/conversations/`, `apps/api/src/modules/exams/`, `apps/api/src/modules/grading/`, `apps/api/src/modules/insights/`, `apps/api/migrations/` e `docs/operations.md` per plan: AI provenance/contracts ai-jobs envelope/research R5 (partial).

**Dependencies**: T081–T082 antes dos ensaios de recuperação/carga; T083–T086 antes de T091; T088 usa T094 e requer saldo autorizado para novas chamadas; T090/T095 precedem a carga com materiais; T096 precede nova evidência real. T089 pode usar fake para invariantes e deve identificar separadamente a qualidade do provider. T092 exige conferência humana; T093 exige bucket isolado. Critérios com participantes SC-001/SC-007 não são resultados comprovados por testes automatizados.
