# Validação — 29/09/2026

## Ambiente

- Node.js 24.19.0, pnpm 10.34.5, PostgreSQL 18 com pgvector, Mailpit e IA fake local.
- `TEST_DATABASE_URL` aponta para banco isolado. E2E usa Edge, API/web nas portas 3101/3100, `.next-e2e` e armazenamento local separado.
- A matriz em `tests/fixtures/acceptance-matrix.md` associa V01–V18 às evidências. Dados de testes são sintéticos.
- O CI foi configurado para repetir as suítes com PostgreSQL, Mailpit e Edge, mas ainda não há execução remota do workflow registrada neste checkout.

## Resultados

| Verificação | Resultado |
| --- | --- |
| Prettier `--check .` | Passou |
| ESLint `--quiet` | Passou |
| TypeScript API e web `--noEmit` | Passou |
| Vitest unit, integration e contract | 32 arquivos, 67 testes passaram |
| Playwright E2E completo | 7 testes passaram |
| Build de produção | Contratos, API e Next.js passaram |
| Corpus de avaliação | 12 casos sintéticos validados; relatório gerado, sem notas humanas |
| Pontuação SC-004/005 | Processador validado com 30+30 linhas sintéticas; relatório de smoke removido, sem evidência pedagógica real |
| Validação visual | Capturas 360/1440 px conferidas; cinco telas a 360/768/1024/1440 px sem overflow, com foco e axe WCAG A/AA aprovados; tentativa e resultado também passaram axe/overflow em 360/1440 px |

Os testes incluem segredo do gabarito, entrega e disputa, seleção/exclusão de fontes, resultados e recomendações, prática dirigida, recuperação de senha, revogação imediata e replay do journal de exclusão, além de conteúdo hostil em mensagens, materiais e respostas. A purga de arquivos/chunks e a revogação de operações foram verificadas em integração. O build incluiu todas as rotas principais.

## Pendências verificáveis

- O k6 não está instalado neste ambiente. `tests/load/study.js` está preparado para 20 usuários e mede separadamente chat, prova, discursiva e objetiva; não há resultado de carga nem custo real medido. Instalar k6 e executar em staging com banco isolado e monitoramento do provedor.
- O corpus em `tests/evaluations` prepara a revisão humana e o processador exige teto explícito, mas não chama o provedor nem fornece as 30+30 revisões humanas necessárias. SC-004/005 seguem sem medição real.
- A inspeção visual e o axe não substituem navegação com leitor de tela. V17 ainda exige essa conferência manual, inclusive estados vazio/erro/pendente.
- V16 cobre retry/fence automatizados; desligamento físico e reinício do worker ainda precisam de ensaio operacional. V18 cobre replay do journal e purga local; restauração integral do bucket S3 em staging ainda precisa de ensaio.

IA fake comprova o fluxo e as invariantes exercitadas, sem afirmar qualidade pedagógica do conteúdo gerado.

## Atualização da convergência

- O teste E2E de acessibilidade foi ampliado para estados vazio, pendente e erro da evolução nas larguras 360/768/1024/1440 px. A execução focada passou (1 teste, 18 s), com verificações de axe, foco e rolagem horizontal. A conferência manual com leitor de tela continua pendente.
- O roteiro k6 agora mede desde o envio da mutação, usa IDs de alternativas recebidos da API e prepara 180 confirmações objetivas (20 contas × 9). `node --check`, ESLint e Prettier passaram para o script. k6 não está instalado aqui; nenhuma medição de carga ou custo foi produzida.
- A API usa `gpt-6-luna` como padrão econômico configurável nas quatro funções de texto; `text-embedding-3-small` permanece nos embeddings. Não houve chamada real nem validação de qualidade desse modelo.
- Os tipos da API e web passaram com `tsc` direto. O Vitest não iniciou neste sandbox por `spawn EPERM`; o comando de workspace `pnpm` encontrou versão 11, enquanto o projeto exige 10, e o Node disponível nesta sessão é 22, enquanto o projeto exige 24. A build da web compilou o CSS, mas também parou ao iniciar processo filho por `EPERM`.
- V16/V18 ganharam consultas e critérios de coleta em `tests/operations/README.md`; desligamento físico do worker, restore isolado do S3 e falha do bucket ainda não foram ensaiados.

## Integração de 30/09/2026

- Vitest completo: 34 arquivos, 127 testes aprovados, nenhum teste omitido; banco isolado e IA fake.
- Playwright: 12 cenários aprovados na rodada completa final (87 segundos), sem falhas, retries ou omissões. Inclui quatro regressões adicionais de arrastar arquivos, validação e nova tentativa com chave de idempotência preservada. Chat com Markdown/Mermaid, upload MD, privacidade, fontes, professor, provas, contestação, evolução, prática e recuperação de senha cobertos.
- Axe WCAG A/AA, foco e overflow: cinco fluxos em 360/768/1024/1440 px; tentativa e resultado em 360/1440 px. Não houve violação nos estados exercitados.
- Prettier, ESLint, TypeScript e build de produção aprovados. Docker compilou contratos, API e web.
- OpenAI real respondeu com gpt-4.1-nano, contrato validado e título Markdown (ensaio curto de conexão). As quatro funções de texto usam esse padrão configurável; embeddings continuam text-embedding-3-small. O teto do chat é 3.000 tokens de saída. Isso não comprova qualidade pedagógica ou resistência a toda manipulação.
- Markdown aceito como material, limites de código aplicados com parser CommonMark, instruções fixas e catálogo de professores validados no servidor. Detalhes e limites em docs/chat-markdown-and-safety.md.
- Stack Docker local com migrações, PostgreSQL, SMTP, API, worker e frontend, com volumes persistentes e chave somente nos serviços backend. Guia em docs/docker.md.
- As pendências de carga, revisão humana, leitor de tela e recuperação externa acima continuam abertas.

## Implementação e ensaios de 01/10/2026

Staging Docker isolado `study-staging`: web http://localhost:3200, API 3201, PostgreSQL/arquivos próprios e contas sintéticas. A stack anterior foi preservada. Ao final, API e worker voltaram a `AI_PROVIDER=fake`; health retornou ok e a web HTTP 200. Guia: `docs/staging.md`.

### Gates locais

- Node 24.15.0 e dependências Linux da imagem, PostgreSQL 18/pgvector e SMTP em rede interna descartável. Host Node 22/pnpm 11 não foram usados como evidência do runtime exigido.
- Vitest completo: **37 arquivos, 147 testes aprovados**, sem omissões. Após restringir os campos do schema de provas, os 15 testes afetados passaram novamente.
- Instrumentos de carga e score: **seis testes aprovados**, incluindo timeouts/falhas, fases ausentes, teto, IDs duplicados e revisão humana incompleta.
- Playwright completo: **12 testes aprovados**, 1,7 min, sem retries. Prova e resultado ampliados para 360/768/1024/1440 px, axe/foco/overflow, confirmação objetiva e entrega por teclado; evolução com dados nas quatro larguras. Capturas de resultado mobile e das jornadas foram conferidas; leitor de tela não foi executado.
- Prettier, ESLint, tipos API/web e builds de contratos/API/Next passaram. Docker compilou também o schema final de provas. O CI recebeu instrumentos e coleta `--dry-run`; execução remota do workflow continua sem evidência nesta sessão.
- Corpus sem custo: 30 fontes e 30 discursivas preparados. Ledger persistente passou teste com reservas simultâneas, uso real, timeout e retomada após reinício.

### Recuperação física e restore local

`tests/operations/run-local.ps1 -Quality` passou em banco próprio. Relatórios finais em `test-results/operations/study-operations-e52b04cc143e/`:

- Quatro processos worker foram interrompidos fisicamente: chat antes do despacho; chat, prova e correção após I/O e antes do commit. Dispatcher e handlers reais, provider fake. Cada recuperação terminou uma vez, sem tentativa/revisão duplicada. O lease foi envelhecido explicitamente para evitar esperar 180 s.
- pg_dump/pg_restore reais, cópia de arquivo sintético, importação de journal posterior ao backup e replay antes de acesso. Material, conversa e tentativa continuaram revogados. Falha real no caminho do filesystem impediu purga; restaurado o acesso, os três registros foram purgados e o arquivo removido.
- Não mede a espera real de 24 h, backup cifrado de produção, desligamento do host ou recuperação de bucket S3. Esses limites permanecem registrados em `tests/operations/README.md`.

### Carga e correções resultantes

Todas as rodadas usaram 20 usuários. Falhas/timeouts são incluídos acima do SLO e fases ausentes falham pela contagem. Chat mede a resposta completa, limite superior para primeiro conteúdo; heartbeat não conta.

| Rodada | Chat p95 / n | Prova p95 / n | Discursiva p95 / n | Objetiva p95 / n | Resultado |
| --- | --- | --- | --- | --- | --- |
| Fake, fila ajustada | 3.596,2 ms / 20 | 4.047 ms / 20 | 2.030 ms / 20 | 7 ms / 180 | Passou |
| Real inicial | 31.929,05 ms / 20 | Sem observações | Sem observações | Sem observações | Falhou |
| Real após instruções de citações | 8.654,05 ms / 20 | 90.001 ms / 20 | Sem observações | Sem observações | Falhou |
| Real, dúvida concreta/prompt de provas | 10.145 ms / 20 | 90.220,3 ms / 20 | Sem observações | Sem observações | Falhou |
| Real, schema de contagem/tipos | 11.238,85 ms / 20 | 120.042,1 ms / 20 | 7.968 ms / 6 | 5 ms / 54 | Falhou |
| Real, schema final v3 | 10.760,55 ms / 20 | 120.054,15 ms / 20 | 90.103,6 ms / 17 | 6,4 ms / 153 | Falhou |

A carga fake inicial tinha dois chats acima de 10 s; a concorrência por processo passou para chat 8, prova 4, correção 4 e materiais 2, com valores configuráveis de 1 a 20. A carga real inicial falhou por respostas incompatíveis com o contrato de citação. Instruções explícitas corrigiram o formato, mas não comprovaram suporte semântico. Provas reais exigiram schema com temas permitidos, listas de tamanhos exatos e campos próprios de cada tipo. O schema v3 usa uma rubrica por discursiva com um critério de 10.000 unidades; a validação transacional continua a rejeitar alternativas/temas/duplicatas inválidos antes de publicar.

Na última rodada, 17 provas foram observadas prontas pelo cliente; respostas posteriores ao timeout não retroagem a sucesso. A trava de orçamento recusou chamadas quando gasto mais reservas simultâneas não comportavam o máximo seguinte, incluindo duas correções. As 153 objetivas observadas tiveram feedback rápido, mas a contagem ficou abaixo das 180 exigidas pelo ensaio completo. **SC-009 não foi aprovado**. O roteiro atual mede geração sem arquivos; carga real de extração/recuperação de materiais também permanece necessária.

### Coleta e revisão pelo agente

- Primeira coleta preservada: 45 sucessos e 15 falhas `AI_SOURCE_INVALID`; custo calculado por tokens US$ 0,0110264. Falhas mantidas no arquivo.
- Coleta após ajuste das instruções: **60 sucessos, zero erros de contrato**, 30 fontes e 30 discursivas. Custo calculado por tokens US$ 0,010807, sem desconto de cache. Entrada/saída, localizadores, modelo retornado/schema, tokens, erros e latência ficam em `test-results/staging/evaluations/2026-10-01T13-03-05.597Z-real/`.
- Os 60 resultados foram inspecionados pelo agente contra os trechos/rubricas sintéticos. Todos os 30 localizadores eram válidos; apenas **6/30 respostas** ficaram inteiramente apoiadas no texto citado na revisão do agente. Muitas atribuíam conhecimento geral à fonte, e uma pergunta hostil recebeu uma citação fictícia marcada como unsupported. Validade de ID não prova suporte.
- Comparação com referências atribuídas pelo agente: **23/30 notas** dentro de 0,2 ponto. Onze justificativas cobravam detalhes ausentes, contradiziam as unidades ou continham erro em relação à referência. Respostas parciais corretas ainda receberam zero em alguns casos. Os dez pedidos hostis de nota máxima receberam zero, sem alterar as unidades por esse pedido.
- Revisão separada em `agent-review.jsonl` e `agent-review-summary.json`, `reviewerType=agent`. Os campos humanos permanecem null. Essa revisão não é aceite humano de SC-004/005; a qualidade observada exige correção antes de lançamento. A avaliação cobre provider/prompt/contrato, sem upload/busca vetorial.

### Orçamento e preservação de evidências

O usuário autorizou teto total de **US$ 0,20**. Durante uma coleta inicial, a limpeza padrão do Playwright apagou o diretório compartilhado de evidências. O custo exato dessa coleta ficou sem artefato; seu teto inteiro de **US$ 0,05** foi considerado gasto desconhecido. Playwright passou a limpar somente `test-results/e2e`, e a coleta seguinte foi integrada ao ledger persistente.

Todas as chamadas posteriores, incluindo coletas, tentativas malsucedidas e carga, compartilham um ledger de US$ 0,15. Ao encerrar: **US$ 0,121978 contabilizados**, zero reservado. Somado ao máximo desconhecido anterior, o gasto total conservador é **até US$ 0,171978**, abaixo de US$ 0,20. Nenhum desconto de cache foi usado. Relatório: `test-results/staging/budget-report.json`; cada carga real referencia o total compartilhado, sem inventar custo individual de uma rodada concorrente.

Não houve publicação em produção. T054–T057 e T079 continuam parcialmente atendidas: desempenho real, qualidade/revisão humana, leitor de tela e S3 têm pendências concretas. Os instrumentos, staging, gates e revisão autorizada T067–T078/T080 foram executados; a próxima fase de convergência registra o trabalho restante.

## Reconciliação e gates — 07/10/2026

Documentação atualizada contra o código das features 001/002, landing e PDF. O estado e as lacunas são registrados em [convergence.md](convergence.md); T101–T102 deixam explícita a integração parcial das aulas por etapas. Nenhuma avaliação humana ou chamada paga foi realizada nesta revisão.

O CI do commit bd31528 parou em formatação (24 arquivos). Após corrigir formatação, a conferência local encontrou regras de lint, tipos opcionais e divergência entre o schema de etapas do provider e o layout antigo do PDF. Foram corrigidos blocos explícitos, fronteiras de validação, interpretação ESM da web e fallback de focusRects. O layout agora aceita etapas estruturadas preservando todas as explicações e diagramas, além da compatibilidade dos testes/exportações do formato anterior. Placeholder de página digitalizada não gera linha textual inventada. Isso não implementa o endpoint de avanço ou aulas persistidas.

| Verificação desta revisão | Resultado |
| --- | --- |
| ESLint completo | Aprovado após os ajustes; nenhuma supressão acrescentada |
| TypeScript API/web, sem emissão | Aprovado com acesso às dependências fora do sandbox |
| Vitest unit | 162 aprovados; três testes condicionados a banco foram omitidos localmente por ausência de TEST_DATABASE_URL |
| Instrumentos de carga/score | Seis testes aprovados |
| Runtime local | Node 22.23.2/pnpm 11.25.0; CLIs das dependências executados diretamente, não equivalem ao runtime canônico Node 24/pnpm 10 |
| Integração/contratos/E2E/build locais | Não repetidos nesta sessão: Docker Desktop não está em execução e não há banco de teste local disponível |

As primeiras tentativas no sandbox falharam por EPERM na resolução de dependências; a execução fora dessas restrições permitiu validar tipos e unidades. Evidência histórica de staging e testes de 01/10 permanece identificada por data e não é apresentada como rodada atual. O workflow remoto usa Node/pnpm fixados, migrações e PostgreSQL isolado para validar o conjunto antes do merge em dev.
