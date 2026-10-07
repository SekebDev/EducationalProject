# EducationalProject

Plataforma individual de estudos com professor de IA, materiais, provas formativas, evolução e prática dirigida. A [especificação](specs/001-ai-study-platform/spec.md), o [plano](specs/001-ai-study-platform/plan.md) e as [tarefas](specs/001-ai-study-platform/tasks.md) descrevem as regras do produto.

## Ambiente de desenvolvimento

Para iniciar o site, a API, o worker, o banco e o e-mail juntos, consulte
[Rodar tudo com Docker](docs/docker.md). Com seu `.env` configurado:

```powershell
docker compose --env-file .env -f infra/compose.yaml up -d --build
```

O site estará em [localhost:3000](http://localhost:3000).

### Desenvolvimento fora dos containers

Requer Node.js 24 LTS (veja `.node-version`), pnpm 10.34.5 e Docker Desktop com containers Linux. As versões e dependências do workspace são fixadas em `package.json` e `pnpm-lock.yaml`.

```powershell
Copy-Item -LiteralPath '.env.example' -Destination '.env'
pnpm install --frozen-lockfile
docker compose -f infra/compose.yaml up -d db smtp
pnpm db:migrate
pnpm dev
```

Substitua `SESSION_SECRET` em `.env` por valor aleatório com pelo menos 32 caracteres. Não use o valor de exemplo em produção. O Compose expõe PostgreSQL e SMTP apenas em `127.0.0.1`. A API usa a porta 3001 e o Next.js, 3000. `/api` é encaminhado para a API local.

O fluxo inclui cadastro, recuperação de senha, conversas com três personalidades, PDF/DOCX/TXT como fontes, prova de 10 a 30 questões, respostas objetivas e discursivas, contestação, evolução por tema/período/nível e prática dirigida. Comece uma conversa, faça uma pergunta e use “Criar prova desta conversa”. O modo local `AI_PROVIDER=fake` exercita os fluxos com conteúdo de demonstração: ele não comprova qualidade pedagógica.

Dentro de cada conversa, **Estudar PDF** abre um material anexado com anotações, páginas adicionais, tutor visual e exportação de PDF completo. As perguntas usam o mesmo chat e seu contexto. A integração da aula por etapas com o mascote ainda está parcial. Consulte [Caderno de PDF](docs/pdf-study.md) para configuração, uso e limites.

A entrada pública usa a identidade Caderno e uma demonstração identificada como simulada. As preferências de método e profundidade estão documentadas em [Skills educacionais](docs/educational-skills.md). O [estado da convergência](specs/001-ai-study-platform/convergence.md) distingue o que foi implementado das pendências técnicas e dos critérios de aceite ainda sem comprovação.

Os comandos `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm test:contract`, `pnpm test:e2e` e `pnpm build` verificam o código. Configure `TEST_DATABASE_URL` para um banco isolado, por exemplo `study_test`. A suíte E2E inicia API e web nas portas 3101/3100 e usa armazenamento separado. Consulte a [validação](specs/001-ai-study-platform/validation.md), a [operação](docs/operations.md) e as tarefas.

## Fluxo de desenvolvimento

A [arquitetura do backend](docs/backend-architecture.md) descreve DTOs, entidades,
validacao HTTP, autenticacao com guards e a organizacao da persistencia.

`main` representa a versão de produção. `dev` é a base de integração do trabalho em andamento. Cada funcionalidade começa em uma branch `feat/<nome>` criada a partir da `dev` atualizada. Após revisão e verificações aplicáveis, a feature é integrada em `dev`. A promoção de `dev` para `main` ocorre somente quando a versão estiver pronta para produção.

```bash
git fetch origin
git switch dev
git pull --ff-only origin dev
git switch -c feat/nome-da-funcionalidade
```

Commits seguem [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/), com mensagens como `feat(chat): salvar conversas` e `fix(exams): impedir pontuação duplicada`. Commits de integração também usam esse formato. Antes de integrar, execute os testes e checks relevantes à mudança; não apresente verificações não executadas como aprovadas.

Publicar a branch de feature e integrar em `dev` após a revisão. Manter `main` sem mudanças de desenvolvimento até a decisão de publicação.
