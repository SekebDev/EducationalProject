# Contrato HTTP v1

Base `/api/v1`, mesma origem do frontend via proxy. JSON UTF-8, IDs UUID, datas ISO 8601 UTC. Todos os endpoints privados usam sessão por cookie e autorização por proprietário, inclusive SSE e download; acesso a ID alheio retorna 404. Nunca confiar em `ownerId` enviado pelo cliente. JSON com campos desconhecidos é rejeitado. Respostas privadas usam `Cache-Control: no-store`.

## Convenções

- Mutação exige Origin válido e token CSRF (inclusive proteção de login). Cookie de produção HttpOnly/Secure/SameSite=Lax; proxy local HTTP usa configuração exclusiva de desenvolvimento.
- Criações de domínio e ações confirm/retry/submit/dispute/reevaluate exigem `Idempotency-Key` UUID. Mesma chave/corpo devolve mesmo recurso/efeito; mesma chave/corpo diferente: 409 `IDEMPOTENCY_CONFLICT`. A consulta de replay revalida autorização e estado atual; não reapresenta conteúdo excluído. Dois requests concorrentes esperam o registro vencedor ou retornam 409 `OPERATION_IN_PROGRESS` com ID para consultar, nunca criam duas operações.
- Paginação por `cursor` opaco, limite default 20/max 100; `{items, nextCursor}`. Ordenação estável por data/id, mensagens por sequence. Rascunhos/seleções usam versão retornada pelo servidor; versão antiga: 409 `VERSION_CONFLICT` com versão atual.
- Sucesso de leitura/edição 200, criação síncrona 201, aceitação assíncrona 202, exclusão 204. Erro: `{error:{code,message,fieldErrors?,retryable,requestId}}`. 400 sintaxe, 401 sessão, 404 ausente/alheio, 409 estado/versão, 413 limite, 415 formato, 422 validação, 429 limite, 503 dependência indisponível. Nenhum stack trace ou payload de provedor.
- Texto de chat até 12.000 caracteres, discursiva até 20.000, motivo de contestação 1–2.000; tema/nível até 200, título até 120. Limites de produto visíveis nos campos. Notas null sempre acompanhadas de motivo.

## Autenticação

| Método e rota | Entrada | Resultado |
|---|---|---|
| GET /auth/csrf | — | token de proteção para formulários |
| POST /auth/register | email, password (12–128 caracteres) | 201 usuário público e sessão; e-mail normalizado único |
| POST /auth/login | email, password | 200 usuário público, novo cookie; falha genérica |
| GET /auth/me | — | id, email, timezone; nunca token/hash |
| POST /auth/logout | — | 204, revoga sessão |
| POST /auth/password-reset | email | 202 genérico, mesmo se não cadastrado |
| POST /auth/password-reset/confirm | token, newPassword | 204, uso único e revogação de sessões |

Cadastro/login/reset não usam idempotência de domínio; têm limites de abuso e transações próprias. Sessões expiram em sete dias absolutos, reset em 15 min. Não registrar tokens nos logs.

## Conversas e materiais

| Método e rota | Entrada / comportamento | Resultado |
|---|---|---|
| GET /personalities | catálogo público autenticado | key, nome, descrição das três opções |
| POST /conversations | personality, title? | 201 Conversation |
| GET /conversations | cursor | lista |
| GET /conversations/:id | — | Conversation, seleção atual e versão |
| PATCH /conversations/:id | personality?, title?, version | atualização; turno em curso mantém snapshot anterior |
| DELETE /conversations/:id | confirmação na UI | 204; materiais inacessíveis, provas preservadas |
| GET /conversations/:id/messages | cursor | mensagens com estado, personalidade e referências |
| POST /conversations/:id/messages | content, conversationVersion | 202 `{userMessage,assistantMessageId,operationId}`; usa seleção pronta atual |
| PUT /conversations/:id/sources | materialIds (0–10), version | seleção atômica; processando/falhou/excluído rejeitado |
| POST /conversations/:id/materials | multipart com um arquivo | 202 `{materialId,state:received,operationId}` |
| GET /conversations/:id/materials | cursor | nome, formato, bytes, estado, erro e selecionado |
| GET /materials/:id | — | metadados públicos; sem object_key |
| GET /materials/:id/content | — | download autenticado attachment; sem link público permanente |
| GET /materials/:id/chunks/:chunkId | — | texto e localizador de fonte ativa, mesma conta |
| DELETE /materials/:id | confirmação na UI | 204, revoga recuperação/download imediatamente |

Upload rejeita 0 bytes, >20.000.000 bytes, formato divergente, senha, ausência de texto ou UTF-8 inválido. Cada conversa tem dez materiais ativos no máximo. Falhas detectadas após recebimento aparecem em Material.failed. Idempotência do multipart usa hash do arquivo e metadados, sem reenviar job para retry do mesmo upload. Fonte DOCX referencia parágrafo/trecho, nunca página inventada. Download autorizado pela API revalida exclusão a cada request; não expor URL S3 que continue válida após revogação.

Message pública: `{id,sequence,role,content,state,personality,references:[{materialId,chunkId,name,locator,available}],aiGenerated}`. Ref inválida não chega ao cliente. Mensagem concluída é canônica; fragmento de streaming é provisório e não é duplicado em retomadas. Somente um turno ativo por conversa: 409 `TURN_IN_PROGRESS`.

## Provas, tentativas e correções

| Método e rota | Entrada / comportamento | Resultado |
|---|---|---|
| POST /exams | conversationId, topicNames[], studyLevel, total, objectiveCount, essayCount, materialIds[], originRecommendationId? | 202 `{examId,operationId}`; valida conversa do dono com pergunta concluída, cria snapshot limitado do histórico e valida antes de gerar |
| GET /exams | cursor | lista, estado, tentativa única |
| GET /exams/:id | — | prova e QuestionPublic[] quando ready; operationId quando pendente |
| DELETE /exams/:id | confirmação | 204; exclui acesso à prova/tentativa e recalcula indicadores |
| GET /attempts | cursor | lista de tentativas |
| GET /attempts/:id | — | estado, questões públicas, rascunhos, confirmações, saveVersion |
| PUT /attempts/:id/answers/:questionId/draft | value, expectedVersion | 200 rascunho/version; não revela correção |
| POST /attempts/:id/answers/:questionId/confirm | value, expectedVersion | objetiva 200 feedback; discursiva 202 resposta bloqueada/operationId |
| POST /attempts/:id/submit | expectedVersion, acceptUnanswered:boolean | 200/202 tentativa entregue; corrige brancas zero |
| GET /attempts/:id/result | — | nota/status, contagens, temas, feedback disponível |
| DELETE /attempts/:id | confirmação | 204, remove dos agregados |
| POST /answers/:id/disputes | reason | 201 contestação aberta; efeito imediato nos agregados |
| POST /disputes/:id/reevaluate | — | 202 operationId, mesma resposta/rubrica |
| GET /answers/:id/grade-revisions | — | revisões e motivos; apenas dono e após confirmação/entrega |

Configuração: inteiros 10..30, contagens >=0 cuja soma seja total, pelo menos um tema, número de temas <= total. Distribuir ao menos uma questão por tema; se distribuição não informada, repartir quociente/resto na ordem de seleção. Padrão UI 10/5/5. Fontes até dez, prontas e do estudante. Confirmação objetiva exige ID de alternativa válido; discursiva exige texto após trim não vazio.

`QuestionPublic = {id,ordinal,type,topic,studyLevel,statement,alternatives?:[{id,text}]}`. Não incluir opção correta, rubric, referenceAnswer, explicações ou campos de score no payload de prova/SSR/RSC/cache. Referências de correção somente após confirmação ou entrega. Endpoint de tentativa pode conter correção das já confirmadas; nunca das questões ainda abertas.

`Feedback = {status,points:null|number,maxPoints:1,correctOptionId?,optionExplanations?,criteria?:[{id,label,maxPoints,points,reason}],strengths?,gaps?,referenceAnswer?,references,revision,aiGenerated}`. Nota objetiva é calculada sem chamada OpenAI; razões já aprovadas na geração. Discursiva pending/failed mantém points null. Gabarito revelado só da questão confirmada, ou de todas após entrega definitiva. Modelo não escolhe estado nem grava nota diretamente.

Entrega sem `acceptUnanswered:true` e com questões não confirmadas retorna 409 `UNANSWERED_CONFIRMATION_REQUIRED` com quantidade; nada é entregue. Rascunho não confirmado conta como não respondido. Lock da tentativa evita que submit e confirm simultâneos gerem estados incompatíveis. Se rascunho/versão mudou, solicitar atualização antes de entregar. Falha na reavaliação não retira contestação nem apaga versão anterior.

## Operações e eventos

`GET /operations/:id` → `{id,kind,state,phase,attemptCount,retryable,error?,resourceId,updatedAt}`. Progresso é fase real, não porcentagem inventada. `POST /operations/:id/retry` aceita apenas operação falhada e reabre o mesmo trabalho se recurso/fontes ainda válidos; senão 409 com orientação.

`GET /operations/:id/events` usa SSE autenticado. Eventos `{id,type,data}` com tipos `state`, `text.delta` (chat sem fontes), `completed`, `failed`. `Last-Event-ID` retoma eventos persistidos; se janela expirar, enviar `resync` e buscar GET da operação/recurso. IDs crescentes por operação, cliente deduplica. Heartbeat mantém conexão sem alterar progresso. Encerrar no estado terminal. GET polling é fallback quando SSE não estiver disponível.

## Indicadores e prática

`GET /insights?topicId=&level=&from=&to=&timezone=` retorna `{status,filters,questionCount,seriesByLevel,topics:[{topicId,points,possiblePoints,questionCount,percentage,classification,evidenceAnswerIds}],recommendations}`. Datas são convertidas para intervalo UTC [from,to); se ausentes, todo histórico. Resultados só incluem dados elegíveis conforme [modelo](../data-model.md). Gráficos recebem datas, valores e quantidades; sem base: null, não zero.

`POST /recommendations/:id/practice` recebe `{topicIds,total,objectiveCount,essayCount,studyLevel,materialIds}` e retorna 202 como geração normal. IDs de tema devem estar na recomendação válida; pelo menos um e não mais que total. Salvar origem, excluir enunciados literais da tentativa de origem, garantir cobertura e criar nova prova/tentativa. Recomendação obsoleta retorna 409 `STALE_EVIDENCE` e pede atualizar resultados.

## Exemplos de validação de contrato

- Total 9, 31, 10.5 ou soma divergente: 422 e nenhuma operação/consumo OpenAI.
- Repetir confirm com mesma chave: mesma resposta e revisão; trocar alternativa após confirmação: 409.
- Consultar prova de conta B com sessão A: 404; não retornar gabarito em mensagens de erro.
- Excluir fonte durante geração: cancelar publicação, erro `SOURCE_UNAVAILABLE`, histórico anterior preservado.
- Resultado com todas contestadas: `{status:"no_valid_evidence",percentage:null}`; correção indisponível: pending, nunca zero.
