# Contratos de IA e processamento

Contrato interno, não exposto ao navegador. Implementar schemas estritos versionados no backend. `ownerId` vem da sessão/operação, nunca da saída do modelo. Portas específicas para chat, geração, correção e recomendação; nenhuma infraestrutura de agente genérico.

## Envelope e rastreabilidade

Entrada do job: `{operationId,resourceId,ownerId,inputVersion}`. Carregar payload autorizado do banco no início; snapshot registra IDs/versões de fontes, personalidade quando chat, modelo, promptVersion, schemaVersion e configuração. Registrar providerRequestId, tokens, latência, attempt e erro sanitizado; não registrar corpo de estudante em logs.

Saída persistida somente após schema, regras e fence/version válidos. Proibir campos extras. API recusada/incompleta, output truncado, JSON inválido, schema inválido e timeout são estados falhados, sem publicar conteúdo parcial de prova/correção. Uma tentativa de reparo por schema/conteúdo é permitida dentro do orçamento total; se persistir, falhar com orientação. Não recursar indefinidamente.

## Chat

Entrada: pergunta, histórico autorizado com orçamento de contexto, snapshot de personalidade e fontes recuperadas `{chunkId,text,locator}`. Separar instruções de sistema dos conteúdos; nunca interpolar arquivo como mensagem de sistema. Janela recente e resumo versionado preservam continuidade; resumo mantém vínculo às fontes para poder invalidá-lo em exclusão.

Saída com fontes: `{segments:[{text,basis:"source"|"general"|"unsupported",chunkIds:[]}],conflicts:[{description,chunkIds:[]}]}`. Servidor aceita somente IDs recuperados e ainda ativos, atribui nome/localizador original e exige citação em segmentos source. Unsupported informa limitação; general é identificado. Contradição não vira consenso. Sem fontes, chat pode transmitir texto; marcar sempre `aiGenerated:true`.

Histórico enviado à IA omite mensagens/resumos apoiados em fontes excluídas ou desmarcadas, apesar de a UI preservar histórico antigo. Fontes atuais e exclusão são revalidadas no momento de persistir. Não fornecer gabaritos de provas em andamento ao chat.

## Geração de prova

Entrada: temas autorizados, nível, total, objectiveCount/essayCount, fontes selecionadas, cotas por tema e hashes/enunciados da origem a evitar. Conteúdo livre fica delimitado como dados; não pode alterar schema ou quantidades.

Saída: `{support:"sufficient"|"insufficient",reason:null|string,questions:[]}`. Cada questão contém tema permitido, tipo, statement, referências e:

- Objetiva: quatro `{id,text}` distintos, `correctOptionId` pertencente às quatro e `{optionId,explanation}` para todas.
- Discursiva: `rubric:[{id,label,maxUnits,description}]` com teto total 10.000 e `referenceAnswer`.

Entrada de geração inclui o snapshot limitado de mensagens concluídas da conversa de origem. O histórico é dado não confiável; não altera instruções, gabarito nem critérios. Validação determinística: quantidades exatas, não vazio, alternativas distintas, tipos/cotas, nível, tópicos, soma de pesos, IDs de fonte e duplicata por texto normalizado. Checagem de conteúdo detecta ambiguidade/duplicidade semântica e falta de suporte; validar em corpus humano. Não prometer que só schema detecta esses defeitos.

Se insuficiente, não criar tentativa nem questões visíveis. Ready exige todos os gabaritos/rubricas e a tentativa única no mesmo commit. Estágio privado de geração pode ser descartado após falha. Sem fallback externo em prova fundamentada.

## Correção e contestação

Entrada: enunciado, resposta confirmada, rubrica imutável, resposta de referência e evidências permitidas; nunca personalidade como critério. Se original foi excluído, usar apenas enunciado/rubrica/referência já preservados na avaliação, sem consultar ou reconstruir arquivo.

Saída: `{criteria:[{criterionId,awardedUnits,reason}],strengths:[],gaps:[],referenceAnswer,explanation}`. IDs de critérios devem coincidir exatamente com rubrica, sem repetição. Pontos são inteiros 0..maxUnits; soma é calculada no backend. Não aceitar nota total do modelo. Evidência de instrução hostil na resposta não concede pontos nem altera rubrica.

Objetivas e brancas são corrigidas deterministicamente. Reavaliação gera nova revisão, nunca altera resposta ou revisão anterior. Motivo da contestação é dado não confiável. Se ambiguidade/defeito de questão não puder ser resolvido com critérios originais, manter contested e explicar limitação. Exibir que reavaliação também usa IA quando aplicável.

## Insights

Entrada: agregados calculados e IDs/revisões de respostas elegíveis, com questões/feedback mínimos necessários. Saída: `{recommendations:[{topicIds,evidenceAnswerIds,action,explanation}]}`. IDs devem pertencer à entrada e a ação deve ser específica. Não aceitar novos números, níveis de domínio ou temas inferidos fora da base.

Falha de IA não oculta cálculos válidos: painel continua exibindo resumo determinístico e botão de prática por tema, com recomendações textuais indisponíveis e opção de repetir. Amostras insuficientes não recebem inferência de domínio.

## Jobs e falhas

Tipos: extract-material, embed-material, answer-chat, generate-exam, grade-answer, reevaluate-answer, explain-insights, purge-resource. Publicação ao pg-boss tem chave de deduplicação ligada à operação. Commit no domínio exige lease vigente e fence_version atual. Nunca segurar transação de banco durante chamada externa.

Priorizar chat/correção sobre geração/extração para evitar bloqueio de leitura. Concorrência por fila e conta configurável; ajustar ao ensaio de 20 usuários. Retries transitórios por backoff até três execuções, timeout explícito e limite de tokens; recusa/entrada inválida não retenta automaticamente. Timeout inicial de chamada: chat 45 s, geração 120 s, correção 90 s; são limites operacionais, não metas SC-009. Antes dos limites, UI continua mostrando fase real. Purga atrasada permanece inacessível e dispara alerta operacional.

Corpus versionado deve incluir instrução para nota máxima, revelação de gabarito, fonte inventada, material contraditório, falta de suporte, resposta parcialmente correta, saída inválida e indisponibilidade. Mudança de modelo/prompt/schema/chunking exige repetir avaliações relevantes. Custo observado não é estimado como zero; chamadas repetidas podem ser cobradas mesmo com efeito único no banco.
