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

Execute `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm test:contract`, `pnpm test:e2e` e `pnpm build`. O corpus em `tests/evaluations` prepara revisão humana; `test:evaluations:score` calcula SC-004/005 com pelo menos 30 revisões de cada tipo e custo observado. O ensaio k6 (`pnpm test:load`) usa 20 contas sintéticas em banco isolado e separa p95 da resposta completa do chat (limite 10 s), prova pronta (90 s), correção discursiva (60 s) e feedback objetivo (2 s). Como o chat publica a resposta completa, essa medida é mais estrita que o início de resposta exigido por SC-009. Para modo real, defina `MODE=real`, `MAX_BUDGET_USD` e `REAL_RUN_ACK=1`; esses valores são um controle operacional, não uma trava de faturamento no provedor. O k6 não recebe custo/token da API atual: monitore o consumo no provedor e não declare o orçamento validado pelo ensaio. Execute somente em staging. Ainda não há medição real de custo, latência ou qualidade pedagógica aprovada.
