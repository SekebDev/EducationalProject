# Skills educacionais

O chat usa GPT-6 Luna nas gerações de texto. Embeddings continuam em text-embedding-3-small. O modo fake continua disponível para demonstração e testes sem cobrança. OPENAI_CHAT_MODEL, OPENAI_EXAM_MODEL, OPENAI_GRADING_MODEL e OPENAI_INSIGHTS_MODEL permitem configurar o modelo explicitamente, sem fallback silencioso.

No chat, o estudante escolhe **como estudar** (método) e **profundidade**, separadamente da personalidade:

| Skill                  | Comportamento                                                                  |
| ---------------------- | ------------------------------------------------------------------------------ |
| Explicar passo a passo | Intuição, exemplo concreto, conceito formal, justificativa e aplicação.        |
| Prática guiada         | Uma etapa por vez, tentativa antes da solução, pistas e feedback.              |
| Revisão ativa          | Recuperar da memória, conferir a tentativa e identificar tópicos para retomar. |
| Flashcards             | Uma ideia por cartão, frente visível e verso recolhido.                        |

O padrão é explicar + aprofundada, inclusive nas conversas migradas. Resumida mantém o raciocínio essencial; equilibrada desenvolve conceito/exemplo/cuidados; aprofundada detalha relações, pré-requisitos e limites conforme a pergunta. Prática e revisão continuam interativas: profundidade não revela o gabarito antes da tentativa.

Resumos completos, como uma introdução à linguagem R, podem conter vários exemplos pequenos. O guard considera o tamanho de cada bloco individual, não a soma ou a quantidade de exemplos da aula. Pedidos explícitos para entregar aplicações completas continuam recebendo orientação educacional.

## Catálogo e segurança

packages/contracts/src/educational-skills.ts publica IDs, nomes e descrições. apps/api/src/modules/conversations/educational-skills.ts contém instruções confiáveis versionadas. O servidor rejeita chaves, profundidades e versões desconhecidas. Nenhum arquivo enviado pelo estudante define skills ou executa código. O tutor não ganha ferramentas, acesso ao disco ou scripts externos.

Para acrescentar um método: adicionar o ID ao enum e descrição pública; acrescentar suas instruções, migrar a constraint SQL, atualizar a versão do catálogo preservando os métodos antigos usados por snapshots e cobrir o comportamento com testes. Para alterar regras existentes, conservar a versão anterior e registrar a nova versão por turno. A seleção de apenas um método evita combinar regras incompatíveis.

## API e persistência

POST /api/v1/conversations aceita skill e responseDepth opcionais. PATCH /api/v1/conversations/:id aceita esses campos e version. GET da conversa retorna as escolhas; mensagens retornam skill, skillVersion e responseDepth. Cada turno guarda os mesmos snapshots nas mensagens de estudante/professor. Mudanças posteriores não afetam jobs já enfileirados ou repetidos.

Migration 009 é aditiva e usa defaults; clientes antigos continuam enviando apenas personality/title. Contratos de resposta acrescentam metadados. Para voltar à imagem anterior, manter as colunas/valores; a versão anterior ignora campos extras no banco. Não remover volumes ou reiniciar o ledger.

## Modelo, profundidade e orçamento

Luna usa Responses, reasoning.effort=low, store=false e saída estruturada. text.verbosity é low/medium/high conforme a profundidade. Tetos de saída de 2000/4000/6000 tokens são capacidade máxima, não meta de tamanho, e AI_MAX_OUTPUT_TOKENS pode limitá-los. Saída de raciocínio também ocupa o teto e é cobrada. O tutor deve responder proporcionalmente ao pedido, preservando o conteúdo necessário.

Referências oficiais verificadas em 2026-10-01: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [migração e configurações GPT-6](https://developers.openai.com/api/docs/guides/latest-model) e [preços](https://developers.openai.com/api/docs/pricing).

No staging, o orçamento anterior é preservado. O preço reservado/contabilizado de entrada Luna é conservador: US$0.125 por milhão, cobrindo cache writes de 1.25× sobre entrada de US$0.10, sem desconto de cache; saída US$0.50 por milhão. O ledger aceita acrescentar modelos ao final do catálogo e rejeita remoção/reordenação, alteração de preços históricos ou do teto. Timeout mantém a reserva como custo conservador. A disponibilidade da conta e a qualidade precisam ser confirmadas por smoke real; testes mockados não comprovam qualidade pedagógica.

## Reaproveitamento do EduClaude

Orientações adaptadas de shared/personas/explicador.md, plugins/educlaude-study/commands/estudar.md, shared/pedagogy/card-quality.md e plugins/educlaude-study/skills/review-session/SKILL.md, projeto local EduClaude, licença MIT (Copyright 2026 SekebXXX). O aviso completo está em [EduClaude-LICENSE.txt](third-party/EduClaude-LICENSE.txt).

Foram reaproveitados a sequência intuição → exemplo → formalismo, recuperação ativa, feedback sobre tentativas e atomicidade dos cartões. Não foram importados plugins de Claude Code, gravação de arquivos, scripts de agendamento ou SM-2. Nesta entrega flashcards ficam na conversa; não há biblioteca de cartões ou revisão espaçada persistente.
