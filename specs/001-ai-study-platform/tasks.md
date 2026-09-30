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
