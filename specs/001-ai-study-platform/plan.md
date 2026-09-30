# Implementation Plan: Plataforma de estudos com professor de IA

**Branch Git ativa**: `feat/frontend-chat-docker` | **Feature Spec Kit**: `001-ai-study-platform`
**Data**: 2026-09-28 | **Spec**: [spec.md](spec.md) | **Constituição**: 1.0.0

## Summary

Aplicação web em português para conversar com um professor de IA, estudar materiais, responder provas formativas e praticar dificuldades. Next.js apresenta as jornadas; NestJS concentra autorização, regras, persistência e OpenAI. PostgreSQL guarda dados relacionais, trechos vetoriais e fila de trabalhos. Arquivos ficam em armazenamento privado.

O repositório contém a aplicação implementada e documentação. A evidência de verificação e as pendências externas estão em validation.md. O setup retornou `001-ai-study-platform`, mas `git branch --show-current` retornou `main`; nenhuma branch foi criada ou trocada.

## Technical Context

**Language/Version**: TypeScript 6, Node.js 24 LTS >=24.15, backend ESM e pnpm 10 workspaces. Fixar patches compatíveis, versão do runtime, packageManager e lockfile no bootstrap.

**Primary Dependencies**: NestJS 12/Express; Next.js 16 App Router e React compatível; Zod; `pg` e `node-pg-migrate`; pg-boss; SDK oficial OpenAI; pdfjs-dist e Mammoth; Argon2id; AWS SDK S3. Frontend com CSS Modules, tokens próprios, Tailwind, shadcn/ui, Magic UI, Motion, Lucide e Radix para componentes complexos. Revisar licença, manutenção e vulnerabilidades antes de adotar cada pacote.

**Storage**: PostgreSQL 18 com pgvector, JSONB validado, sessões e fila no mesmo banco; S3 privado em produção, diretório privado fora de public no desenvolvimento. Sem Redis ou segundo banco principal.

**Testing**: Vitest; Supertest/PostgreSQL descartável para integração; Playwright/axe para jornadas e acessibilidade; k6 para carga; corpus com referência humana para IA. CI usa IA determinística falsa, avaliação real roda separadamente com limite de gasto.

**Target Platform**: web online desde 360 px; Windows/PowerShell e Docker no desenvolvimento, containers Linux em produção. Proxy de mesma origem, web, API, worker persistente, PostgreSQL e S3. Hospedagem será configurada antes de publicar, sem alterar contratos.

**Project Type**: monorepo web e monólito modular com worker no mesmo pacote da API.

**Performance Goals**: 20 estudantes simultâneos; p95 início de resposta do chat <=10 s, prova <=90 s, correção discursiva <=60 s; feedback objetivo <=2 s em 95% das confirmações. Metas ainda não medidas.

**Constraints**: 10–30 questões, quatro alternativas por objetiva, uma tentativa por prova, 1 ponto por questão; PDF textual/DOCX/TXT/MD <=20.000.000 bytes, dez materiais ativos por conversa; nenhum gabarito antecipado ou segredo no frontend; sem OCR, ferramentas autônomas, offline, turmas ou certificação.

**Scale/Scope**: cinco jornadas, três personalidades, sete módulos de negócio; medir antes de ampliar infraestrutura.

## Constitution Check

| Gate | Antes da pesquisa | Após o design |
|---|---|---|
| I. Legibilidade e consistência | Passa: projeto novo | Tipos estritos, formatação/lint e módulos por domínio |
| II. Fronteiras simples | Passa: stack aprovada | Uma API, worker compartilhado e cálculos puros separados de I/O |
| III. Testes de comportamento | Passa: critérios na spec | Limites, falhas, concorrência, notas e contestação; IA e relógio controlados |
| IV. Integração e regressão | Passa: interfaces identificadas | Banco real, HTTP, jobs interrompidos, duas contas e cinco jornadas |
| V. Manutenção e documentação | Passa: escopo registrado | Pesquisa, modelo, contratos, UX, guia e recuperação de migrações |
| Qualidade e dependências | Passa no planejamento | Auditoria/pins no bootstrap; build, tipos, lint e testes obrigatórios no CI |

Nenhuma exceção constitucional. Conformidade do design não significa que testes ou benchmarks do software passaram.

## Arquitetura e responsabilidades

1. `auth`: e-mail/senha, Argon2id, recuperação por SMTP e sessões opacas revogáveis no banco. Cookie HttpOnly/Secure/SameSite=Lax em produção, CSRF e Origin em mutações; limite por IP/conta em login/reset. Nunca aceitar proprietário do cliente.
2. `conversations`: histórico ordenado, personalidade e fontes. Um turno ativo por conversa; pergunta e operação persistidas juntas. Mudança de personalidade vale no próximo turno.
3. `materials`: upload streaming, formato real, extração, trechos localizáveis e embeddings. Autorização em upload, leitura, seleção e recuperação. Exclusão revoga acesso imediatamente.
4. `exams`: configuração, geração validada e publicação atômica de questões/gabaritos. Sem cobertura, falhar sem publicar prova parcial. DTOs públicos nunca incluem gabarito.
5. `attempts`: rascunhos versionados, confirmação imutável, entrega e nota objetiva transacional. Uma tentativa criada com a publicação da prova.
6. `grading`: rubrica imutável, correção discursiva, contestação e versões de reavaliação; falha nunca vira zero.
7. `insights`: cálculos por tema/nível/período; recomendações ligadas às respostas; prática dirigida com origem preservada.

Infraestrutura compartilhada: banco, storage, OpenAI, jobs e logs. Módulos só acessam contratos públicos entre si. Frontend compartilha apenas schemas públicos, sem tipos privados de gabarito.

### Assincronia e integridade

A transação HTTP cria recurso e `operation` pendente. Dispatcher recuperável publica o ID no pg-boss e registra despacho depois. Enqueue repetido é tolerado por handlers idempotentes. Worker adquire lease/version, executa I/O fora de transação longa e publica resultado em commit condicional. Lease perdido impede gravação tardia.

Exclusão/cancelamento incrementa versão; verificar fontes e autorização antes de enviar ao provedor e antes de gravar. Requisição já enviada não pode ser desfeita, mas seu resultado pode ser descartado. Jobs usam IDs, não payloads completos. Retentar falhas transitórias até três execuções com backoff, jitter e Retry-After. Repetição manual mantém a operação de negócio; chamadas externas podem custar novamente, mas não duplicam efeitos no banco.

Criação/confirmar/entregar/contestar/reavaliar usam chave de idempotência por usuário e rota. Rascunhos usam versão otimista; confirmação e entrega serializam no lock da tentativa. Chat sem fontes pode transmitir texto; com fontes só publica resposta/citações após validação. Reconexão lê estado salvo. Heartbeat não conta como início de resposta para SC-009.

### IA e materiais

Responses API, `store:false`, sem Conversations hospedadas ou ferramentas executáveis. Baseline econômico de avaliação `gpt-4.1-nano`, configurável por função; `text-embedding-3-small` para busca. Qualidade, custo e latência exigem ensaio, conforme [research.md](research.md).

Busca lexical/vetorial filtra proprietário e fontes selecionadas antes de recuperar. PDF mantém páginas, DOCX parágrafos, TXT linhas. Servidor valida localizadores; suporte semântico exige revisão humana. Prova com fontes nunca completa silenciosamente com conhecimento geral. Personalidade não muda rubricas.

### Operação, retenção e migrações

- Limites iniciais: uma geração de prova e dois jobs de chat/correção simultâneos por conta; concorrência global configurável. Tokens, tempo e orçamento limitados por operação; 429 preserva dados e informa retry.
- Logs por trace ID, latência, status e consumo, sem texto estudantil, arquivo ou credenciais; retenção proposta de 14 dias.
- Exclusão lógica imediata; purga de originais/trechos/embeddings em até 24 h, retry e alerta. Provas anteriores mantêm conteúdo e metadados mínimos da fonte indisponível, sem download do original.
- Backups cifrados por 30 dias; restauração reaplica registro de exclusões antes de liberar acesso. Validar política real de storage/provedor e informar antes de lançar. `store:false` não é retenção zero.
- Migrações SQL versionadas por papel separado; testar banco vazio e atualização anterior. Mudanças aditivas antes de remoções, backup antes de operação destrutiva e restore ensaiado em ambiente isolado; sem rollback destrutivo automático.

## Project Structure

### Documentation (this feature)

```text
specs/001-ai-study-platform/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── ai-jobs.md
│   └── ux.md
└── tasks.md                 # próxima etapa; não gerado neste comando
```

### Source Code (proposto)

```text
apps/
├── web/src/
│   ├── app/
│   ├── features/
│   ├── components/ui/
│   └── styles/
└── api/
    ├── src/
    │   ├── main.ts
    │   ├── worker.ts
    │   ├── modules/         # sete módulos descritos acima
    │   └── infrastructure/ # db, storage, ai, jobs, logging
    ├── migrations/
    └── test/
packages/contracts/src/     # somente DTOs públicos
tests/                      # e2e, fixtures, evaluations, load
infra/                      # compose e deploy
.github/workflows/
```

**Structure Decision**: pnpm workspaces sem framework extra de monorepo; worker compartilha o pacote da API, evitando microserviços e duplicação.

## Sequência e rastreabilidade

| Incremento | Requisitos | Evidência |
|---|---|---|
| Fundação/chat P1 | FR-001–003, 018–021; TC-001–004 | Login, isolamento, personalidade, retomada, falha/retry e rótulo IA |
| Materiais P2 | FR-004–006; TC-005 | Formatos, limites, fontes, exclusão e instruções hostis |
| Provas P2 | FR-007–014, 018, 021 | Quantidade, gabarito secreto, rascunho, notas, entrega e contestação |
| Evolução P3 | FR-015–016, 020 | Filtros, amostra mínima, reavaliação, exclusão e texto equivalente |
| Prática P3 | FR-017 | Cobertura, novos enunciados, origem e tentativa separada |
| Transversal | FR-019; UX-001–006; SC-001–009 | Teclado, 360/1440 px, corpus humano, carga e CI |

## Entregáveis e encerramento

[Pesquisa](research.md), [modelo](data-model.md), [HTTP](contracts/http-api.md), [IA/jobs](contracts/ai-jobs.md), [UX](contracts/ux.md) e [validação](quickstart.md). Decisões técnicas resolvidas; pins, credenciais, medição e avaliação visual são gates da implementação/lançamento, não resultados obtidos.

Hooks: `.specify/extensions.yml` ausente nas inspeções anterior e posterior ao planejamento; nenhum hook aplicável. Pesquisa delegada interrompida por limite de uso, concluída diretamente com fontes oficiais. Launcher Impeccable sem acesso ao cache; referências lidas diretamente. Nenhum mockup ou identidade declarados aprovados.

## Complexity Tracking

Sem violações. pgvector atende busca semântica, pg-boss atende durabilidade e S3 atende arquivos originais: necessidades atuais da especificação.
