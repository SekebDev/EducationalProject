# Tasks: Skills educacionais e GPT-6 Luna

Input: spec.md e plan.md nesta pasta. Escopo separado da feature 001.

## Phase 1: Setup

- [x] T001 Documentar reuso MIT e modelo oficial em docs/educational-skills.md e docs/third-party/EduClaude-LICENSE.txt.

## Phase 2: Foundational

- [x] T002 Definir catálogo público e tipos de skill/profundidade em packages/contracts/src/educational-skills.ts e packages/contracts/src/index.ts (FR-001/004).
- [x] T003 Acrescentar preferências e snapshots aditivos em apps/api/migrations/009_educational_skills.sql (FR-002/004).
- [x] T004 Adaptar métodos versionados do EduClaude em apps/api/src/modules/conversations/educational-skills.ts (FR-001/003).

## Phase 3: US1 — Profundidade e Luna (P1)

Objetivo: explicações aprofundadas por padrão e migração sem perder limites. Teste independente: requests mockados provam modelo, configurações, conteúdo de instruções e tetos.

- [x] T005 [US1] Cobrir profundidade, injeção e compatibilidade de modelos em apps/api/test/ai/prompt-safety.spec.ts (US1/AC2/3).
- [x] T006 [US1] Compor skills, profundidade e parâmetros Luna em apps/api/src/infrastructure/ai/provider.ts (FR-005, US1/AC1/2/3).
- [x] T007 [US1] Permitir extensão imutável de preços sem reiniciar saldo em apps/api/src/infrastructure/ai/run-budget.ts e apps/api/test/ai/run-budget.integration.spec.ts (FR-006).
- [x] T008 [US1] Atualizar modelo e preços conservadores em .env.example e infra/compose.staging.yaml (FR-005/006).

## Phase 4: US2 — Skills no chat (P1)

Objetivo: seleção persistente, snapshot estável e interface acessível. Teste independente: mudar preferências, recarregar e executar turno anterior com snapshot original.

- [x] T009 [US2] Cobrir persistência, isolamento e snapshots em apps/api/test/conversations/chat.integration.spec.ts e tests/contract/conversations.spec.ts (US2/AC1/2).
- [x] T010 [US2] Integrar DTOs/entidades/serviço e snapshots no worker em apps/api/src/modules/conversations/{dto/conversations.dto,entities/conversations.entity,conversations.service,chat.job}.ts (FR-002/004).
- [x] T011 [US2] Criar seleção de skill e profundidade no chat em apps/web/src/features/chat/StudySkillControls.tsx e apps/web/src/app/conversas/[id]/page.tsx (US2/AC1).
- [x] T012 [US2] Exibir flashcards com resposta recolhida e testar jornada por teclado/recarga em apps/web/src/features/chat/RichMessage.tsx e tests/e2e/chat.spec.ts (US2/AC3, SC-002).

## Phase 5: Polish & validation

- [x] T013 Executar checks e registrar resultado/migração em specs/002-educational-skills/validation.md (SC-001/002/003).
- [x] T014 Reconstruir staging e conferir uma chamada real sob orçamento preservado, registrando em specs/002-educational-skills/validation.md e docs/staging.md (FR-007).
- [x] T015 Refinar upload, seleção e estados do painel com Impeccable/Taste em apps/web/src/features/materials/MaterialsPanel.tsx e apps/web/src/features/materials/MaterialsPanel.module.css (FR-009).
- [x] T016 Verificar painel e controles juntos em desktop/celular com screenshots e acessibilidade em tests/e2e/chat.spec.ts e specs/002-educational-skills/validation.md (FR-009, SC-002).
- [x] T017 Corrigir falso bloqueio de aulas com vários exemplos e testar R básico, derivadas e limites individuais em apps/api/src/infrastructure/ai/study-chat-policy.ts e apps/api/test/ai/study-chat-policy.spec.ts (US1/AC4).
- [x] T018 Preservar conteúdo visível antes da hidratação com movimento reduzido e corrigir contrastes detectados pelo teste de acessibilidade em apps/web/src/components/ui/blur-fade.tsx e estilos de autenticação (SC-003).

## Dependencies

T001 → T002 → T003/T004 → US1 e US2 → T013 → T014. US2 worker depende de T006. Os testes T005/T009 precedem implementação correspondente. US1 é MVP, US2 completa o pedido.

## Parallel opportunities

Testes de prompt e contratos podem ser preparados independentemente após o catálogo; controles do chat e ledger têm arquivos distintos. Executar sequencialmente nesta sessão.

## Implementation strategy

Primeiro catálogo/migração, depois regras do provider, persistência/worker e controles. Verificar sem chamadas pagas antes do build do staging. Convergir somente contra o escopo desta feature.
