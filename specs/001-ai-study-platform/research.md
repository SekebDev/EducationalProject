# Pesquisa e decisões

Data: 2026-09-28. Decisões propostas para implementação, não resultados de benchmark. Fontes primárias consultadas; revisar compatibilidade e segurança ao fixar o lockfile.

## R1 — Runtime e organização

**Decisão:** Node 24 LTS >=24.15, TypeScript 6, NestJS 12 ESM, Next.js 16, PostgreSQL 18 e pnpm workspaces. Fixar patches compatíveis no bootstrap com instalação limpa e build.

**Motivo:** atende a stack solicitada e o requisito mais restritivo do CLI Nest. Dois aplicativos e contratos compartilhados são suficientes.

**Alternativas:** CommonJS resolve legado inexistente; microserviços e frameworks adicionais de monorepo não se justificam na escala inicial.

**Fontes:** [Nest](https://docs.nestjs.com/migration-guide), [Next 16](https://nextjs.org/docs/app/guides/upgrading/version-16), [PostgreSQL](https://www.postgresql.org/support/versioning/).

## R2 — Persistência e autenticação

**Decisão:** `pg` com SQL parametrizado e node-pg-migrate, tabelas relacionais e JSONB validado. E-mail/senha com Argon2id e sessão opaca no banco. Cookie de mesma origem, proteção CSRF, autorização por proprietário e recuperação de senha por SMTP. Sessão expira em sete dias absolutos; reset tem token aleatório, hash persistido, uso único e 15 minutos. Logout/troca de senha revogam sessões.

**Motivo:** revogação imediata e consultas/locks explícitos. Não aceitar `ownerId` do cliente. Os prazos são decisões do projeto.

**Alternativas:** JWT em localStorage amplia exposição e dificulta revogação; provedor de login externo adiciona configuração; ORM não elimina SQL de vetores/relatórios. Não criar abstração genérica de repositório sem necessidade.

## R3 — Jobs e idempotência

**Decisão:** pg-boss no PostgreSQL; registro de operação na mesma transação do domínio, dispatcher recuperável e handlers idempotentes. A operação também é o estado público do processamento.

**Motivo:** extração, geração e correção sobrevivem a quedas. A fila não torna a chamada OpenAI exatamente uma vez; efeitos no banco usam constraints, lease e commits condicionais.

**Alternativas:** BullMQ exige Redis; HTTP longo não garante retomada; scheduler próprio completo amplia manutenção. A ponte transacional mínima evita perder jobs entre commit e enqueue.

**Fonte:** [pg-boss](https://github.com/timgit/pg-boss).

## R4 — Arquivos e recuperação

**Decisão:** S3 privado em produção e diretório privado local. PDF.js para texto por página, Mammoth para texto DOCX dividido em parágrafos, TXT UTF-8 com linhas. Sem HTML do documento no navegador. Limites operacionais iniciais: 60 s e 512 MiB por processo de extração, DOCX até 100 MiB descompactados e texto até dois milhões de caracteres; rejeitar com motivo e orientação, informando esses limites na ajuda.

**Motivo:** localizadores verificáveis e contenção de arquivos hostis. Extração em processo isolado, sem rede nem acesso arbitrário ao filesystem.

**Decisão de busca:** chunking aproximado de 800 tokens/120 de sobreposição, sem atravessar localizadores; embeddings `text-embedding-3-small`, dimensão inicial 1536 registrada; pgvector com busca exata e busca textual portuguesa, rankings combinados. Filtrar proprietário/fontes antes da busca. Chat recupera até oito trechos dentro do orçamento. Provas recuperam cobertura por tema; suporte insuficiente falha, não completa com informação externa.

**Alternativas:** binários no banco ampliam backups; File Search hospedado reduz controle de localizadores e exclusão; busca só lexical perde aproximações; HNSW fica para quando medição justificar.

**Fontes:** [PDF.js](https://mozilla.github.io/pdf.js/), [Mammoth](https://github.com/mwilliamson/mammoth.js), [pgvector](https://github.com/pgvector/pgvector), [embeddings](https://developers.openai.com/api/docs/models/text-embedding-3-small).

## R5 — API e modelo de IA

**Decisão:** SDK oficial, Responses API, JSON Schema estrito e `store:false`. Baseline `gpt-6-sol` para chat, provas, correção e explicação de insights, com variáveis por função. A documentação confirma streaming e Structured Outputs; acesso e limites da conta não foram testados.

**Motivo:** baseline comum reduz variáveis até haver corpus. Não há evidência para prometer qualidade ou custo do produto. Medir tokens, custo por conversa/prova/correção, qualidade e latência; usar preços vigentes no ensaio. Liberar somente configuração que cumpra SC-004/005/009 e orçamento. Registrar modelo retornado e versões de prompt/schema em cada geração.

**Alternativas:** modelo menor pode substituir após avaliação; modelo mais forte é candidato se qualidade falhar. Não fazer fallback silencioso. Fine-tuning, agentes e ferramentas executáveis não são necessários.

**Fontes:** [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol), [Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## R6 — Referências, notas e instruções hostis

**Decisão:** material, resposta do estudante e histórico são dados não confiáveis; instruções do sistema e rubrica são separados. Modelo não recebe segredos, SQL ou ferramentas. Validar quantidade, distribuição, alternativas, rubrica, temas, duplicatas e localizadores antes de publicar. Recusa/truncamento/JSON inválido produzem falha explícita.

**Motivo:** schema não garante verdade. Servidor calcula nota a partir dos critérios e verifica existência de citações; revisão humana mede suporte semântico. Personalidade só altera chat.

**Alternativas:** confiar no prompt ou na nota total devolvida pela IA viola requisitos. Segunda chamada de revisão pode auxiliar, mas não substitui autorização nem evidência humana.

## R7 — Retenção

**Decisão:** histórico próprio; sem Conversations, File Search hospedado ou background mode do provedor. Exclusão revoga acesso imediatamente; purga de originais/trechos/embeddings até 24 h; backups cifrados 30 dias e logs sem conteúdo 14 dias, como política a implementar.

**Motivo:** controle de acesso/exclusão verificável. `store:false` não promete retenção zero: monitoramento de abuso e exceções de cache podem permanecer. Verificar controles efetivos da conta/modelo e informar antes de lançar.

**Alternativas:** estado hospedado exige coordenar mais exclusões. Não prometer apagar instantaneamente backups ou conteúdo já enviado ao provedor.

**Fonte:** [Data controls](https://developers.openai.com/api/docs/guides/your-data).

## R8 — Experiência

**Decisão:** aplicação de estudo em modo Operate, com leitura longa. Chat central, materiais auxiliares, prova em coluna de leitura e resultado orientado à próxima prática. Direção proposta: superfícies claras quentes, tinta escura, verde em ações e Source Sans 3. [Contrato UX](contracts/ux.md) define estados e critérios.

**Motivo:** ciclo explicar–avaliar–praticar com evidência é o mecanismo principal. Aplicar Impeccable para clareza/estados e Taste frontend-ui-engineering para componentes acessíveis. Não foi criado mockup nem presumida aprovação visual.

**Alternativas:** landing page, gráficos fictícios e estética de assistente mágico não atendem ao escopo. Design-taste-frontend foi consultada para roteamento e não se aplica às telas operacionais.

## R9 — Validação e encerramento

**Decisão:** testes determinísticos em CI e corpus real de IA separado, reavaliado após mudanças em modelo/prompt/chunking/rubrica. Credenciais, pins exatos e medições são etapas de implementação; não há decisão técnica bloqueante aberta. [Quickstart](quickstart.md) define evidência de aceite.

**Motivo:** IA real em cada commit custa e varia; removê-la da validação final impediria avaliar qualidade pedagógica. Nenhum serviço contratado e nenhuma geração paga nesta fase.
