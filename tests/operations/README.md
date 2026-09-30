# Ensaios V16 e V18 em staging

Use uma implantação isolada com banco e bucket próprios, dados sintéticos e backup recente. Guarde commit, migrações, horários, IDs de operações, status HTTP, eventos e consultas SQL antes/depois em um relatório privado. Não rode estes passos no banco de desenvolvimento compartilhado nem em produção.

## V16: interrupção do worker

1. Crie uma conta sintética e uma conversa; envie uma pergunta com chave de idempotência e registre o ID da operação.
2. Desligue somente o processo worker após a operação ser persistida e antes do despacho; reinicie. Observe transição para `completed`, uma mensagem lógica de resposta e nenhum evento duplicado.
3. Repita desligando o worker após obter lease e antes de publicar; aguarde expiração do lease e reinicie. Verifique `fence_version`, uma única resposta/nota final e a mesma chave de idempotência.
4. Repita com geração de prova e correção discursiva; confira uma única tentativa, uma revisão corrente e histórico preservado.
5. Registre duração, tentativas, falhas e qualquer operação que não se recupere. Não considere aprovado apenas porque o processo reiniciou.

Os testes `apps/api/test/jobs/operations.integration.spec.ts` cobrem retry/fence sem matar o processo. O ensaio físico acima ainda precisa ser executado no staging.

Para cada interrupção, salve a linha de `operation` antes de parar o worker, após o lease expirar e após a recuperação. Consulte pelo ID concreto da operação, sem copiar dados pessoais para o relatório:

```sql
SELECT id, kind, resource_id, state, phase, dispatch_state,
       attempt_count, fence_version, lease_until, error_code,
       created_at, updated_at
FROM operation WHERE id = :'operation_id'::uuid;

SELECT sequence, type, created_at
FROM operation_event WHERE operation_id = :'operation_id'::uuid
ORDER BY sequence;

SELECT role, state, count(*)
FROM message WHERE turn_id = :'turn_id'::uuid
GROUP BY role, state;
```

Uma operação recuperada deve terminar uma vez em `completed`; `fence_version` deve avançar quando um lease antigo é substituído. Para chat, confirme uma resposta `assistant` por `turn_id`. Para prova e correção, registre também os IDs da tentativa, resposta e revisão corrente e confira pela interface que não há duplicação. Se a operação ficar `pending`/`running`, ou se aparecerem duas respostas lógicas, anote a falha e não marque V16 como aprovado.

## V18: restauração e falha temporária de storage

1. Faça backup cifrado do banco e bucket e exporte `deletion_record` separadamente; registre os instantes de cada cópia.
2. Exclua um material, uma tentativa e uma conversa após o backup. Confirme 404 imediato, ausência em listagens e operação SSE encerrada.
3. Restaure banco e bucket numa instância isolada, sem tráfego nem worker. Reimporte o journal recente e execute `scripts/replay-deletions.sql` antes de liberar a API.
4. Confirme novamente os 404, recomendações invalidadas e nenhum download do material excluído. Inicie o worker e verifique a purga dentro da janela de 24 horas.
5. Interrompa temporariamente o acesso ao bucket durante a purga; o registro deve continuar `pending`, e o acesso continuar revogado. Restaure o bucket e confira retry e `purged`.

`apps/api/test/deletion/purge.integration.spec.ts` injeta uma falha de storage e verifica retry local. O ensaio completo do bucket S3 e do restore em staging ainda precisa ser executado.

No banco restaurado, rode estas consultas antes de iniciar a API, imediatamente após o replay e após a purga. Use IDs sintéticos do ensaio. A consulta ao journal confirma que a cópia separada inclui exclusões posteriores ao backup:

```sql
SELECT resource_type, resource_id, deleted_at, purge_state, purged_at
FROM deletion_record
WHERE resource_id IN (:'conversation_id'::uuid, :'material_id'::uuid, :'attempt_id'::uuid)
ORDER BY deleted_at;

SELECT 'conversation' AS resource_type, id, deleted_at FROM conversation
WHERE id = :'conversation_id'::uuid
UNION ALL
SELECT 'material', id, deleted_at FROM material
WHERE id = :'material_id'::uuid
UNION ALL
SELECT 'attempt', id, deleted_at FROM attempt
WHERE id = :'attempt_id'::uuid;
```

Após o replay, toda linha restaurada dos três recursos deve ter `deleted_at` preenchido e continuar inacessível por HTTP. Durante a falha do bucket, registre o horário e o `purge_state='pending'`; após restabelecer o acesso, registre `purge_state='purged'`, `purged_at` e a ausência do objeto no bucket. Guarde no relatório o tempo entre `deleted_at` e `purged_at` para comprovar o limite de 24 horas. Não publique IDs, URLs assinadas ou segredos do staging.
