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
