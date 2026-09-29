# Modelo de dados

## Convenções e isolamento

UUIDs gerados no servidor; timestamps UTC `timestamptz`; intervalos de filtro [início, fim), convertidos da timezone informada. Entidades privadas carregam `owner_id`. FKs compostas `(owner_id, parent_id)` impedem vínculos entre contas; consultas e workers sempre filtram proprietário. IDs não são autorização. JSONB passa por schema versionado antes de gravar. Textos são escapados ao exibir.

Pontos armazenados em inteiros de 0 a 10.000 unidades (1 ponto), evitando erro binário. Rubrica soma exatamente 10.000; cada critério tem teto inteiro. Percentual é 100 × soma(unidades)/(10.000 × questões válidas), arredondado half-up para uma casa somente na exibição; classificação usa valor não arredondado.

## Entidades e relacionamentos

| Entidade | Campos principais e regras |
|---|---|
| Student | id, email normalizado único, password_hash, timezone, created_at; senha nunca retornada |
| Session | id, student_id, token_hash único, csrf_hash, expires_at, revoked_at; sessão opaca, token só no cookie |
| PasswordReset | student_id, token_hash único, expires_at, used_at; consumo atômico |
| Personality | key enum acolhedora/objetiva/socratica, description, style_prompt_version; catálogo versionado |
| Conversation | id, owner_id, title, personality_key, version, created_at, deleted_at |
| Message | id, owner_id, conversation_id, sequence, role user/assistant, content, state, turn_id, personality_snapshot, references, model/prompt_version; unique(conversation_id,sequence), unique(turn_id,role) |
| Material | id, owner_id, conversation_id, original_name, detected_mime, byte_size, checksum, object_key privado, state, error_code, version, deleted_at; 1..20.000.000 bytes |
| MaterialChunk | id, owner_id, material_id, extraction_version, ordinal, text, locator JSONB, token_count, embedding, embedding_model/dimensions; unique(material_id,extraction_version,ordinal) |
| ConversationSource | owner_id, conversation_id, material_id; única por par; somente material pronto e ativo pertencente à conversa |
| Topic | id, owner_id, display_name, normalized_name; unique(owner_id,normalized_name). Normalização trim/case/espaços, sem fusão automática de sinônimos |
| Exam | id, owner_id, conversation_id, context_snapshot, title, study_level, total, objective_count, essay_count, state, generation_operation_id único, source_recommendation_id nullable, origin_snapshot, created_at, deleted_at |
| ExamTopic | owner_id, exam_id, topic_id, requested_count; em prática dirigida cada tema tem pelo menos uma questão |
| ExamSource | owner_id, exam_id, material_id nullable, material_version, name_snapshot, available; conteúdo original não duplicado |
| Question | id, owner_id, exam_id, ordinal, topic_id, study_level_snapshot, type, statement, statement_hash, alternatives públicas, source_locators; unique(exam_id,ordinal), unique(exam_id,statement_hash) |
| QuestionSecret | question_id, owner_id, correct_option_id ou rubric JSONB, option_explanations ou reference_answer, schema_version; inacessível a DTOs de prova |
| Attempt | id, owner_id, exam_id único, state, version, started_at, submitted_at, deleted_at |
| Answer | id, owner_id, attempt_id, question_id, draft_value, draft_version, confirmed_value, confirmed_at, state; unique(attempt_id,question_id) |
| GradeRevision | id, owner_id, answer_id, revision_number, kind objective/essay/blank, points_units, criterion_scores, explanation, gaps, reference_answer, model, prompt_version, rubric_version, created_at; unique(answer_id,revision_number) |
| GradeCurrent | answer_id único, owner_id, current_revision_id nullable, state pending/graded/failed/contested; aponta para revisão imutável |
| Dispute | id, owner_id, answer_id, grade_revision_id nullable, reason, status open/reviewing/resolved, resolution_revision_id nullable, created_at; no máximo uma aberta por resposta |
| Recommendation | id, owner_id, topic_ids, evidence_answer_ids, evidence_revision_ids, filter_snapshot, action, state, created_at; referências verificadas antes da publicação |
| Operation | id, owner_id, kind, resource_id, dedupe_key único por owner/kind, state, dispatch_state, attempt_count, lease_until, fence_version, input_version, error_code, timestamps; metadados sem payloads sensíveis |
| OperationEvent | operation_id, owner_id, sequence, type, data, created_at; unique(operation_id,sequence); acesso privado, expiração em 24 h e purga imediata em exclusão; texto de streaming é conteúdo privado, nunca log |
| IdempotencyRecord | owner_id, route, key, request_hash, resource_id, response_status; unique(owner_id,route,key); sem cache de resposta secreta; retido enquanto recurso existir |
| DeletionRecord | resource_type/id, deleted_at, purge_state, purged_at; sem conteúdo; mantido por janela de backup + 7 dias para restaurar exclusões |

Cada questão pertence a exatamente um tema principal. Toda nova prova pertence a uma conversa do estudante com ao menos uma pergunta concluída. `exam.conversation_id` identifica a origem e `context_snapshot` conserva, no máximo, as 12 mensagens concluídas mais recentes, limitadas a 900 caracteres cada, para uma geração estável. Fontes opcionais devem ser materiais prontos da mesma conversa; máximo dez por prova. Provas criadas antes dessa regra podem ter origem nula durante a migração.

## Invariantes de publicação

- `10 <= total <= 30`, contagens inteiras não negativas cuja soma é total. Padrão 10/5/5. Objetiva tem quatro alternativas com IDs únicos e exatamente uma correta; explicação de todas disponível no servidor.
- Discursiva tem rubrica não vazia com soma exata de 10.000 unidades, critérios identificados, resposta de referência e justificativas; tudo definido antes de publicar.
- Exatamente `total` questões, tipos e distribuição por temas válidos. Em prática dirigida, número de temas <= total; todos recebem pelo menos uma questão. Novos enunciados não repetem hash normalizado da origem.
- Validar duplicidade literal determinística e revisão de similaridade semântica antes da publicação; se não conseguir gerar suficiente sem repetição, falhar com orientação.
- Constraint de contagem entre linhas é verificada na transação de publicação e reforçada por trigger de transição para ready. Questões/gabaritos publicados são imutáveis; mudanças exigem nova prova.
- Tentativa e questões sempre pertencem à mesma prova, verificado por FKs compostas ou trigger. Criação de tentativa é única por prova, na mesma transação de publicação.
- Limite de dez materiais inclui recebido/processando/pronto/falhou não excluídos. Reserva de vaga sob lock da conversa evita dois uploads ultrapassarem o limite. Seleção exige ready e versão ativa.

## Máquinas de estado

**Material:** received → processing → ready | failed; failed → processing em retry válido; qualquer ativo → deleted (terminal). Objetos temporários órfãos são reconciliados/purgados. Falha em embeddings impede ready.

**Turno/mensagem assistente:** queued → generating → completed | failed; failed → queued na mesma mensagem. Uma pergunta confirmada permanece mesmo se a resposta falhar. Partial streaming não equivale a completed.

**Exam:** queued → generating → ready | failed; failed → queued usando a mesma configuração/ID; mudar configuração cria nova prova. Ready não retorna a generating. Exclusão é terminal para acesso.

**Attempt:** in_progress → submitted_pending | completed. Entrega bloqueia rascunhos e confirmações, cria zero para respostas não confirmadas (mesmo que tenham rascunho) após confirmação explícita. submitted_pending → completed quando todas as correções iniciais terminarem. Falha de correção mantém submitted_pending.

**Answer:** draft → confirmed_pending → graded; objetiva confirma e corrige na mesma transação. Entrega transforma draft em blank/graded zero. confirmed_value não muda. Falha mantém confirmação salva e correção failed com nota nula.

**Contestação:** graded ou blank → contested; abre motivo e retira a questão dos cálculos imediatamente. Reavaliação solicitada pelo estudante: open → reviewing → resolved somente após revisão válida; falha retorna open, sem substituir revisão. Objetiva é recalculada deterministicamente contra gabarito imutável com justificativa, podendo manter a nota; IA não troca alternativa correta. Discursiva usa rubrica original. Questão ambígua que não puder ser validada continua contestada. Resposta em branco continua zero quando reavaliada, sem inventar resposta. Histórico original sempre preservado.

**Operation:** queued → running → succeeded | failed | cancelled; falha transitória volta a queued; lease expirado permite nova execução; fence_version impede commit antigo. Retry manual só em failed. Recurso excluído cancela operação e rejeita resultado tardio.

## Agregados e evolução

Indicadores são consultas/projeções derivadas, não números gerados pela IA. Considerar tentativas entregues, não excluídas, sem correções iniciais pendentes/falhadas nas questões não contestadas. Contestações ficam fora do numerador, denominador e volume; reavaliação pendente mantém a questão excluída. Uma tentativa pode continuar elegível pelas demais questões válidas.

Sem base válida, nota null e motivo `no_valid_evidence`; pendência inicial resulta em `pending`, sem nota definitiva. Tema com menos de três questões válidas: `insufficient_data`; abaixo de 60%: `attention`; 60% a <80%: `developing`; >=80%: `strength`. Blancas entregues contam como evidência de zero. Contagens do resultado são exclusivas, com precedência contested, pending/failed, blank, full(1), partial(0<x<1), wrong(0).

Filtrar por submitted_at, tema e nível; níveis diferentes geram séries separadas, sem alegar comparabilidade. Exclusão/revisão invalida caches e recomendações cujas evidências perderam validade. Consultar relatório sempre revalida evidências; recomendação obsoleta não inicia prática silenciosamente.

## Exclusão e índices

Excluir conversa remove acesso a mensagens, materiais e chunks, limpa seleção, cancela jobs e marca ExamSource como indisponível, preservando provas. Excluir material remove arquivo/chunks/embedding e desabilita citações navegáveis; preservar somente nome/localizador histórico, enunciados e correções. Não usar texto do material excluído em novos prompts, inclusive histórico enviado ao chat: recompor contexto com fontes ativas e omitir mensagens fundamentadas exclusivamente na fonte removida. Excluir tentativa remove acesso a respostas, notas e seus agregados; não recriar tentativa para a mesma prova.

Índices iniciais: owner/deleted_at/created_at, conversation/sequence, material/ordinal, exam/ordinal, attempt/question, owner/submitted_at, question/topic, operation/state/lease_until; GIN para texto. Banco usa chaves únicas para idempotência, revisões e tentativa. Índices vetoriais aproximados somente após medir necessidade.
