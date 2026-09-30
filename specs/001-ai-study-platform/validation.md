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
