# Guia de execução e validação

## Estado atual

A aplicação Next.js/NestJS, worker, migrações e testes estão implementados. Os resultados locais mais recentes estão em [validation.md](validation.md); os procedimentos de implantação, backup e retenção estão em [docs/operations.md](../../docs/operations.md). O projeto ainda não tem ensaio de carga, avaliação humana ou recuperação integral do S3 aprovados. Este guia mantém os cenários de aceite para a próxima execução em staging.

## Pré-requisitos após o bootstrap

- Node.js 24 LTS >=24.15 e pnpm 10, com versões exatas registradas no projeto; Docker Desktop com containers Linux no Windows.
- PostgreSQL 18 com pgvector pelo Compose do projeto, banco de teste separado e caixa SMTP local. Migrações e seed somente sintético, isolado da produção.
- `.env.example` documenta DATABASE_URL, TEST_DATABASE_URL, APP_ORIGIN, SESSION_SECRET, STORAGE_DRIVER/local path ou S3_BUCKET/REGION, SMTP_HOST/PORT/FROM, AI_PROVIDER=fake|openai, OPENAI_API_KEY, modelos e limites de entrada/saída. Orçamento dos ensaios é configurado nos comandos próprios.
- Secrets somente em `.env` ignorado/secret manager. Variáveis OpenAI/S3/sessão nunca usam prefixo NEXT_PUBLIC. Falta de configuração obrigatória deve interromper inicialização com diagnóstico sem valor secreto.
- Modo fake é explicitamente identificado na interface local; produção recusa iniciar com fake. Modelo inicial real `gpt-4.1-nano` e embeddings `text-embedding-3-small`; validar disponibilidade da conta.

## Comandos (PowerShell, raiz do repositório)

```powershell
Copy-Item -LiteralPath '.env.example' -Destination '.env'
pnpm install --frozen-lockfile
docker compose -f infra/compose.yaml up -d
pnpm db:migrate
pnpm db:seed:test
pnpm dev
```

Não sobrescrever `.env` existente. `pnpm dev` inicia web na porta 3000, API interna 3001 e worker; proxy `/api` mantém cookie/CSRF na mesma origem. PostgreSQL e SMTP locais escutam somente loopback. `pnpm db:seed:test` recusa produção. Use apenas contas e materiais sintéticos no banco de teste.

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:contract
pnpm test:e2e
pnpm build
```

Esses comandos foram executados localmente em 29/09/2026; veja contagens e ressalvas em `validation.md`. O CI configura PostgreSQL, Mailpit, migrações e Edge para repetir unitários, integração, contratos e E2E com IA fake. Integração/contratos usam `TEST_DATABASE_URL` e limpam seus dados. `test:e2e` inicializa API, worker e web em 3101/3100.

```powershell
pnpm test:evaluations
pnpm test:load
```

`test:evaluations` valida o corpus e prepara um relatório sem chamar modelos. `test:load` requer k6 instalado e aceita modo fake para infraestrutura; modo real exige staging, chave e orçamento explícitos. Nenhum resultado real de qualidade ou p95 foi obtido neste ambiente. Dados de ensaio devem ser sintéticos/revisados, sem arquivos pessoais.

## Cenários reproduzíveis

| ID | Preparação e ação | Resultado obrigatório |
|---|---|---|
| V01 — acesso/chat | Criar contas A/B. A escolhe acolhedora, envia pergunta sem arquivo, troca para socrática e reabre | Histórico preservado, novas respostas adotam estilo, IA identificada; B não acessa IDs de A |
| V02 — retry do chat | Injetar timeout após salvar pergunta e repetir com mesma chave; desconectar SSE | Uma pergunta/uma resposta lógica, estado explícito, retomada sem texto duplicado |
| V03 — upload | Enviar PDF textual, DOCX, TXT; 20.000.000/20.000.001 bytes; 10/11 arquivos | Formatos aceitos com localizador real; limites recusados; inválido/protegido/digitalizado sem texto falha com motivo |
| V04 — fontes | Fixture com fatos conhecidos, pergunta coberta/ausente/contraditória; desmarcar e excluir | Citações verificáveis, limitação declarada, fontes removidas ausentes de novos prompts/respostas/provas |
| V05 — gerar | Sem chat/upload, solicitar 10 e 30 questões só objetivas, só discursivas e misturadas; incluir 9/31/10.5 e soma errada | Prova exata ou rejeição antes da IA; quatro alternativas/uma correta; sem duplicata; gabaritos definidos só no backend |
| V06 — segredo | Inspecionar HTTP, HTML/RSC, cache, erros e estado inicial da prova; selecionar sem confirmar | Nenhum gabarito, rubrica secreta ou explicação antecipada; feedback somente ao confirmar a questão |
| V07 — confirmar | Duplo clique e duas requisições paralelas, mesma/diferente chave; confirmação competindo com entrega | Resposta única imutável e revisão única; conflito explícito, sem pontuação dupla |
| V08 — discursiva | Respostas correta, parcial, vazia e com instrução para nota máxima; simular IA indisponível | Vazia rejeitada; rubrica preservada; parcial justificada; falha não vira zero; retry mantém resposta |
| V09 — retomada | Salvar rascunho, confirmar outra questão, recarregar; editar rascunho em duas abas | Retoma salvo e confirmado; versão antiga não sobrescreve nova; falha de salvamento visível |
| V10 — entrega | Manter duas questões não confirmadas, uma com rascunho; entregar com/sem confirmação | Sem confirmação não entrega; com confirmação ambas zero e resposta bloqueada; correções pendentes sinalizadas |
| V11 — cálculo | Carregar fixture revisada com acertos, parciais, erros, brancas e contestações | Percentual, estados, volume e tema exatos; zero denominador retorna null |
| V12 — revisão | Contestar uma questão e solicitar reavaliação; simular falha antes de sucesso | Sai imediatamente dos agregados; falha mantém contestação; nova versão preserva anterior e justifica resolução |
| V13 — filtros | Duas datas e dois níveis, tema com 2/3 questões e valores 59,99/60/79,99/80% | Limiares calculados sem arredondamento precoce; amostra insuficiente explícita; séries separadas por nível |
| V14 — prática | Selecionar temas válidos de recomendação e pedir prova dirigida; selecionar mais temas que questões | Cada tema recebe questão, nenhum tema externo ou repetição literal da origem; nova tentativa; excesso rejeitado |
| V15 — exclusão | Excluir material/conversa/tentativa, inclusive com job ativo e link direto antigo | Acesso imediatamente negado, novas gerações não usam fonte, prova antiga preserva conteúdo, painel recalculado |
| V16 — durabilidade | Matar worker antes/depois de chamada, enqueue e commit; reiniciar | Job recupera; fence impede worker antigo; nenhuma tentativa/resposta/nota duplicada |
| V17 — UI | Cinco jornadas por teclado em 360/1440 px com texto longo, pending/erro/vazio | Sem corte/overflow global, foco visível, estados anunciados, gráfico com tabela/texto |
| V18 — operação | Banco vazio/upgrade, backup/restore com exclusões, storage temporariamente indisponível | Migrações reproduzíveis, exclusões reaplicadas, purga retentada sem reabrir acesso |

Detalhes de payloads em [HTTP](contracts/http-api.md); pontos/estados em [modelo](data-model.md); regras de IA em [IA/jobs](contracts/ai-jobs.md); direção e revisão visual em [UX](contracts/ux.md).

## Fixture numérica mínima

Uma prova de dez questões, todas entregues e corrigidas: 4 completas, 2 parciais de 0,5, 2 erradas e 2 brancas. Soma 5; nota 50,0%. Contestar uma completa remove 1 do numerador e uma questão do denominador: 4/9 = 44,4%, nove evidências. Contestar todas: null/sem base. Reavaliar a questão contestada para 1 restaura 5/10, preservando versão original. Se uma discursiva ainda estiver pendente de correção inicial, nota definitiva fica indisponível e a tentativa não alimenta os agregados até resolução.

Criar fixtures adicionais independentes por tema: duas questões a 100% continuam insuficientes; três a 60% em desenvolvimento; três a 80% ponto forte. Testar arredondamento de exibição sem alterar classificação por valor bruto, mudança de timezone nos limites de datas e exclusão de tentativa.

## Evidência para os critérios de sucesso

| Critério | Ensaio e saída a registrar |
|---|---|
| SC-001 | Dez estudantes: pelo menos nove iniciam conversa sem ajuda em <=2 min após acesso |
| SC-002 | Cem configurações válidas, cobrindo extremos/composições: 100% das provas publicadas respeitam contrato; registrar também falhas, sem ocultar taxa de geração |
| SC-003 | Cem confirmações objetivas: >=95 em <=2 s, sem gabarito anterior |
| SC-004 | Trinta respostas com fontes revisadas por humano: >=27 sustentadas e zero localizador inexistente; registrar perguntas sem suporte |
| SC-005 | Trinta discursivas/rubricas com notas humanas: >=27 diferenças <=0,2; todas com justificativa por critério |
| SC-006 | Fixtures determinísticas batem 100% com cálculos/limiares, incluindo contestação e exclusão |
| SC-007 | Dez estudantes: pelo menos oito identificam melhoria e iniciam prática em <=3 min |
| SC-008 | Matriz de falhas/reenvios e isolamento: 100% de confirmações preservadas, zero duplicação/acesso cruzado |
| SC-009 | Vinte estudantes concorrentes em staging real: p95 chat <=10 s, provas <=90 s, correções <=60 s; timeouts entram no relatório, não são descartados |

Guardar commit, ambiente, configuração/modelo/prompt, seed/corpus, latências e custo em `tests/evaluations/results/` ou artefatos de CI, sem segredos. SC-004/005 têm revisão de conteúdo humana; design e automação não substituem essa evidência. Registrar orçamento observado por sessão e validar limite operacional antes de disponibilizar produção.

## Diagnóstico

- Operação parada: conferir status/lease/dispatcher e requestId; retry na mesma operação, sem editar nota manualmente.
- Fonte indisponível: atualizar seleção ou enviar outro material; nunca recriar citação inexistente.
- 429/503: manter respostas e informar próxima tentativa; não iniciar operação nova automaticamente.
- Falha de benchmark: não declarar aceite; registrar cenário, causa e condição objetiva para nova execução.
- Antes do lançamento: verificar política real de retenção/provedor/backups, isolamento do bucket, limites de gasto e restore. Esses gates ainda não foram executados.
