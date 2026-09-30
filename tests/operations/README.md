# Ensaios V16 e V18 em staging

Use uma implantação isolada com banco e bucket próprios, dados sintéticos e backup recente. Guarde commit, migrações, horários, IDs de operações, status HTTP, eventos e consultas SQL antes/depois em um relatório privado. Não rode estes passos no banco de desenvolvimento compartilhado nem em produção.

## V16: interrupção do worker

1. Crie uma conta sintética e uma conversa; envie uma pergunta com chave de idempotência e registre o ID da operação.
2. Desligue somente o processo worker após a operação ser persistida e antes do despacho; reinicie. Observe transição para `completed`, uma mensagem lógica de resposta e nenhum evento duplicado.
3. Repita desligando o worker após obter lease e antes de publicar; aguarde expiração do lease e reinicie. Verifique `fence_version`, uma única resposta/nota final e a mesma chave de idempotência.
4. Repita com geração de prova e correção discursiva; confira uma única tentativa, uma revisão corrente e histórico preservado.
5. Registre duração, tentativas, falhas e qualquer operação que não se recupere. Não considere aprovado apenas porque o processo reiniciou.

Os testes `apps/api/test/jobs/operations.integration.spec.ts` cobrem retry/fence sem matar o processo. O ensaio físico acima ainda precisa ser executado no staging.

## V18: restauração e falha temporária de storage

1. Faça backup cifrado do banco e bucket e exporte `deletion_record` separadamente; registre os instantes de cada cópia.
2. Exclua um material, uma tentativa e uma conversa após o backup. Confirme 404 imediato, ausência em listagens e operação SSE encerrada.
3. Restaure banco e bucket numa instância isolada, sem tráfego nem worker. Reimporte o journal recente e execute `scripts/replay-deletions.sql` antes de liberar a API.
4. Confirme novamente os 404, recomendações invalidadas e nenhum download do material excluído. Inicie o worker e verifique a purga dentro da janela de 24 horas.
5. Interrompa temporariamente o acesso ao bucket durante a purga; o registro deve continuar `pending`, e o acesso continuar revogado. Restaure o bucket e confira retry e `purged`.

`apps/api/test/deletion/purge.integration.spec.ts` injeta uma falha de storage e verifica retry local. O ensaio completo do bucket S3 e do restore em staging ainda precisa ser executado.
