# Validação: skills educacionais e GPT-6 Luna

Data: 2026-10-01. Escopo: feature 002 e correção do bloqueio indevido de resumos completos; não encerra as pendências da feature 001.

## Resultado

Staging isolado atualizado em http://localhost:3200, API saudável em http://localhost:3201/api/v1/health. API, worker e web foram recriados; banco, arquivos, UUID e ledger preservados. Migration 009 aplicada de forma aditiva. A stack original de desenvolvimento permanece independente. Texto usa gpt-6-luna, embeddings continuam em text-embedding-3-small; nenhuma credencial é entregue ao frontend.

Métodos explicar/praticar/revisar/flashcards e profundidades resumida/equilibrada/aprofundada persistem por conversa. Defaults explicação aprofundada atendem conversas existentes e novas. Snapshots do turno preservam método, versão e profundidade após mudanças e retries. Métodos adaptados do EduClaude sob MIT, com aviso em docs/third-party/EduClaude-LICENSE.txt; projeto de origem somente lido.

## Checks executados

| Verificação | Resultado |
| --- | --- |
| Tipos e ESLint completos | Passaram no container descartável Node 24.15.0/pnpm 10.34.5, com fontes finais sobrepostas |
| Vitest completo | 38 arquivos, 162 testes passaram; inclui contrato, persistência, isolamento, retries, extensão imutável de preços e 27 regressões do guard |
| Playwright completo | 13 testes passaram, workers=1, IA fake; skills/recarga/teclado/flashcards, arquivos, autenticação, provas e evolução |
| Acessibilidade | Axe, foco, contraste e largura em cinco fluxos/quatro larguras passaram; inclui estados adicionais da evolução |
| Prettier completo | `prettier --check .` passou |
| Build de produção | API e Next.js 16.3.6 passaram na imagem final do staging |
| Smoke HTTP do staging | Health status ok, web HTTP 200 |

Comando canônico: container descartável da imagem projeto-educacional:staging com scripts/validation-overlay.mjs, fontes da raiz montadas somente para leitura, TEST_DATABASE_URL apontado ao banco de teste e AI_PROVIDER=fake/OPENAI_API_KEY vazio. Executados pnpm -r typecheck, pnpm lint e pnpm exec vitest run. O host usa Node 22; a validação canônica evita trocar seu pnpm global incompatível. Playwright executado pelo CLI local com a configuração de serviços de teste e saída test-results/educational-skills/e2e.

O primeiro ensaio paralelo de navegador teve falha transitória de recuperação de senha e revelou contraste insuficiente durante a entrada animada. A execução serial confirmou a recuperação; o conteúdo de BlurFade agora fica visível antes da hidratação com movimento reduzido. Dois textos de apoio da autenticação foram ajustados para contraste 5,60:1. Nenhuma asserção axe foi removida ou enfraquecida. A execução completa final passou.

## Verificação visual

Painel refinado com Impeccable Operate e princípios compatíveis de Taste: upload, estados, contador de fontes, nomes longos, ações e foco. Inspeção visual de desktop 1440px e celular 360px confirmou nomes legíveis, seleção por teclado, contador 0→1→2, estados Pronto e adaptação sem overflow. Capturas finais privadas preservadas em test-results/educational-skills/files-1440.png, files-360.png e skills-360.png. A seleção de método/profundidade também foi confirmada com recarga; flashcards ocultam o verso até a ação por teclado, preservando Markdown e fallback para formato incompleto.

## IA real e correção de R

O primeiro smoke de derivadas completou no Luna, mas o guard antigo substituiu a aula por uma recusa de 197 caracteres ao detectar mais de quatro exemplos. O mesmo mecanismo explica o caso de R relatado pelo usuário. A regra agora limita cada bloco individual (6000 caracteres/180 linhas), sem somar exemplos independentes nem restringir sua quantidade. Continua rejeitando pedidos explícitos de aplicações completas e entregas excessivas de arquivos. Regressões cobrem R com dez exemplos, derivadas/fórmulas, aulas com totais altos distribuídos e limites individuais CommonMark.

Depois da correção, uma chamada real pelo provider do staging produziu um resumo completo de R básico com 8834 caracteres/1442 palavras, cobrindo variáveis, tipos, vetores/indexação, listas, data.frames, if/else, for/while, funções, NA, CSV, gráficos, erros comuns e atividade. Revisão do conteúdo confirmou exemplos pequenos e explicados, distinção entre `[ ]` e `[[ ]]`, início dos índices em 1, uso de is.na/na.rm e cuidados de importação. Há pequenas imperfeições editoriais (espaços desnecessários em dois exemplos); a cobertura solicitada foi entregue e o bloqueio indevido desapareceu. Não houve execução dos exemplos no R; esta é uma observação de qualidade de uma resposta, não certificação do modelo.

Resposta real: modelo gpt-6-luna, 1443 tokens de entrada (1269 cached), 2805 tokens de saída. Custo conservador no ledger: 1583 micro USD = US$0,001583, sem descontar cache. Artefatos privados: test-results/staging/r-basic-luna-smoke.json e resumo-r-luna.md. A evidência comprova o provider e a saída após o guard; persistência e renderização foram verificadas separadamente por integração/E2E, sem alegar uma avaliação paga de todas as skills.

## Orçamento preservado

UUID 83f56b6b-0ef3-4f91-98eb-a94216031369, teto persistente US$0,15, dentro dos US$0,20 autorizados após reservar conservadoramente US$0,05 de uma coleta anterior cujo artefato se perdeu. Após o smoke final: spent_micro_usd=131921, reserved_micro_usd=0. Total conservador US$0,181921 e saldo US$0,018079. Leituras são snapshots: uso posterior pelo usuário consome o mesmo saldo.

Um teste de insights herdou a configuração OpenAI do .env antes da correção de isolamento e fez uma chamada nano fora do ledger. Foi divulgado ao usuário e contabilizado conservadoramente em US$0,006 no ledger existente, sem reiniciar saldo; valor incluído nos números acima. Vitest agora aplica apps/api/test/setup.ts a todos os projetos, impondo fake e removendo a chave real. Mocks explícitos de SDK usam somente credenciais fictícias. Os checks finais não fizeram chamadas pagas.

API/worker ficam em openai para atender ao pedido de testar a IA real. Reservas máximas antes de cada chamada podem bloquear um pedido mesmo quando seu custo final provável seria menor. Não alterar UUID, teto, preços históricos nem remover volumes para contornar esse limite.

## Compatibilidade e limites

DTOs de criação/edição aceitam novos campos opcionais; respostas acrescentam metadados. Migration 009 mantém defaults para clientes antigos. Em rollback, conservar colunas e valores; não apagar volumes. Imports .ts funcionam no Next dev e rewriteRelativeImportExtensions emite .js no build.

Flashcards ficam no chat, sem biblioteca persistente de cartões ou repetição espaçada. Skills são instruções educacionais confiáveis versionadas, sem execução de scripts/plugins do EduClaude. A validação desta feature não substitui os ensaios pagos de outras funcionalidades, carga e revisão externa pendentes da feature 001.
