# Operação do Caderno

## Ambiente e implantação

Use Node.js 24, pnpm 10.34.5, PostgreSQL 18 com pgvector, SMTP e armazenamento privado. Copie `.env.example` para `.env` e defina `DATABASE_URL`, `APP_ORIGIN`, `SESSION_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `AI_PROVIDER` e `STORAGE_DRIVER`. `AI_PROVIDER=fake` é somente para desenvolvimento e testes. Produção exige `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `STORAGE_DRIVER=s3`, `S3_BUCKET` e `S3_REGION`. Restrinja PostgreSQL, SMTP e objetos ao serviço; não publique `.env`.

Execute `pnpm install --frozen-lockfile`, `pnpm db:migrate`, depois API, worker e web (`pnpm dev` localmente). Migrações são ordenadas e idempotentes pelo registro de versão; aplique em staging antes de produção. Após upgrade, consulte `/api/v1/health` e confirme que o worker despacha operações pendentes. `TEST_DATABASE_URL` deve apontar para banco isolado. O Playwright usa 3100/3101 e `.local-storage-e2e`.

## Exclusão e retenção

Excluir conversa, material, prova ou tentativa define `deleted_at` e revoga acesso imediatamente. Trabalhos pendentes são cancelados com incremento da versão de fence. O endpoint SSE consulta autorização a cada evento; ao perder acesso, encerra a conexão e limpa seus timers. Recomendações ligadas a evidências excluídas deixam de iniciar prática. O worker procura registros de exclusão a cada minuto e purga os dados após 23 horas, dando margem para o limite de 24 horas enquanto estiver disponível. Arquivos e chunks de materiais são removidos; referências históricas de provas guardam só nome/localização indisponível. Registros de exclusão sem conteúdo ficam por 37 dias após a purga e então são podados. Monitore `SELECT resource_type,count(*),min(deleted_at) FROM deletion_record WHERE purge_state='pending' GROUP BY resource_type`; qualquer registro com mais de 24 horas exige intervenção, inclusive se o worker ficou indisponível. O serviço tenta novamente na próxima rodada após falha de armazenamento.

## Backup e restore

O roteiro de ensaio e evidências V16/V18 está em `tests/operations/README.md`.

Mantenha backup cifrado do banco e do bucket privado, mais uma cópia recente e separada de `deletion_record`. Uma restauração de backup antigo sem o journal pode reabrir itens já excluídos. Faça o restore numa instância isolada, sem tráfego e sem worker. No ambiente Compose local, por exemplo:

```powershell
$dbContainer = docker compose -f infra/compose.yaml ps -q db
docker exec $dbContainer sh -c 'pg_dump -U study -Fc -f /tmp/study.dump study'
docker cp "${dbContainer}:/tmp/study.dump" .\study.dump
docker exec $dbContainer createdb -U study study_restore
docker cp .\study.dump "${dbContainer}:/tmp/study.dump"
docker exec $dbContainer pg_restore -U study -d study_restore --clean --if-exists /tmp/study.dump
```

Importe no banco restaurado o journal `deletion_record` mais recente, incluindo exclusões posteriores ao backup, e rode `scripts/replay-deletions.sql` **antes** de abrir a aplicação. Verifique que links de itens excluídos retornam 404, que os materiais estão indisponíveis e que as recomendações obsoletas não iniciam práticas. Inicie o worker para concluir a purga. O teste `apps/api/test/deletion/purge.integration.spec.ts` simula o replay e a purga; ele não substitui um ensaio completo de desastre com o provedor S3. Para restaurar arquivos ainda válidos, restaure também o bucket da mesma data; nunca restaure arquivos excluídos para um caminho acessível.

## Verificações e limites

Execute `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm test:contract`, `pnpm test:instruments`, `pnpm test:e2e` e `pnpm build`. O coletor de `tests/evaluations` prepara 30 fontes e 30 discursivas reais, registrando usage/custo e mantendo campos humanos vazios; `test:evaluations:score` exige revisão humana completa. Revisão do agente fica separada.

O k6 (`pnpm test:load`) usa 20 contas sintéticas, com 20 observações mínimas de chat/prova/discursiva e 180 objetivas. Cronômetros começam antes da mutação HTTP. Falhas são registradas acima do limite, e fases não alcançadas falham pela contagem. SLOs: resposta completa do chat 10 s, prova 90 s, correção 60 s, objetiva 2 s. Polling operacional de 45/120/90 s permite observar respostas tardias sem transformá-las em sucesso no SLO. Resposta completa é um limite superior conservador para início de conteúdo; heartbeat não é conteúdo.

Concorrência por processo worker: `JOB_CHAT_CONCURRENCY=8`, `JOB_EXAM_CONCURRENCY=4`, `JOB_GRADE_CONCURRENCY=4`, `JOB_MATERIAL_CONCURRENCY=2`, inteiros de 1 a 20. Mais réplicas multiplicam essa capacidade; dimensione a soma antes de aumentar a implantação.

Modo real exige `MODE=real`, `MAX_BUDGET_USD`, `REAL_RUN_ACK=1` e a trava do servidor: `AI_RUN_BUDGET_ID` UUID persistente, `AI_RUN_BUDGET_USD` e `AI_RUN_PRICES_JSON` com preços por modelo. A migração aditiva 008 cria ledger e reservas, sem alterar respostas públicas. Backups devem preservar essas tabelas e o ID. Reservas bloqueiam novas chamadas antes do envio; timeout sem usage permanece cobrado pelo máximo, e interrupção de processo não libera saldo. Não há desconto de cache. Essas variáveis não limitam outros aplicativos usando a mesma conta.

O relatório k6 registra latência/falhas; custo vem das tabelas do ledger e é anexado à evidência da rodada. Consulte `docs/staging.md` e `specs/001-ai-study-platform/validation.md` para resultados, teto e limitações. O ensaio fake passou; medições reais não representam aprovação pedagógica.
