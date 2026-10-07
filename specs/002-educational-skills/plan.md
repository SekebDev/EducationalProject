# Plano: skills educacionais

## Stack e decisões

Manter Next.js, NestJS, Zod, PostgreSQL e OpenAI Responses; sem novas dependências.
Catálogo público tipado em packages/contracts/src/educational-skills.ts. Instruções versionadas em apps/api/src/modules/conversations/educational-skills.ts. Somente IDs validados chegam às instruções; dados da conversa continuam não confiáveis.
Migration 009 acrescenta skill_key e response_depth à conversation; message recebe snapshots da skill, versão e profundidade. Defaults aditivos compatíveis com dados antigos. DTOs opcionais preservam clientes existentes; API retorna novos campos.
O worker resolve snapshots, injeta instruções e registra versão do prompt/modelo real configurado. UI usa catálogo público sem conteúdo privado do prompt e mantém edição com version para concorrência otimista.
Respostas aprofundadas usam teto de 6000 tokens, equilibradas 4000 e resumidas 2000, sujeitos a AI_MAX_OUTPUT_TOKENS. Luna usa reasoning low e text.verbosity apropriada; outros modelos explicitamente configurados conservam compatibilidade.
Preço conservador Luna: US$0.125 por milhão de entrada (cobre inclusive cache writes a 1.25x, sem descontar cache) e US$0.50 saída. Ledger permite apenas acrescentar modelos ao final, com teto e preços históricos imutáveis. Não reiniciar ID ou saldo.
Resumos educacionais podem conter muitos exemplos independentes. O guard limita cada bloco individual, preservando a rejeição de pedidos explícitos de aplicações completas; não soma os blocos da aula. Regressões cobrem R e fórmulas de derivadas. Imports públicos usam .ts em desenvolvimento e rewriteRelativeImportExtensions no tsconfig base para emitir .js no build.

## Reuso

Adaptar explicador.md, estudar.md, card-quality.md e review-session/SKILL.md do EduClaude (MIT). Preservar aviso de licença em docs/third-party/EduClaude-LICENSE.txt. Não copiar operações de workspace, scripts Python, controle de arquivos ou SM-2 para prompts do app.

## Validation e recuperação

Unit: prompt e limites, seleção inválida/injeção, métodos educacionais, compatibilidade de modelo. Integration: persistência, snapshots após mudança, retry e isolamento; extensão de preço sem reiniciar gastos/rejeição de alteração. E2E: seleção por teclado, recarga e skill em mensagem. Fake em testes sem cobrança. Um smoke real limitado pelo ledger do staging, sem novo orçamento.
Migration é aditiva: antes de voltar à versão anterior, manter colunas e defaults; antigas versões ignoram as novas colunas. Não remover volumes nem ledger. Reconstruir imagem, migrar e recriar apenas serviços do staging.

## Constitution Check

I: módulos pequenos, nomes explícitos, formatter/lint/tipos. II: catálogo e função de composição, sem plugin runtime abstrato. III/IV: testes de comportamento e contrato/persistência/E2E, fake para serviços externos. V: origem, configuração, migração e escopo registrados; nenhuma alteração ao projeto de origem.

## Touch points

packages/contracts/src/{index,educational-skills}.ts; apps/api/migrations/009_educational_skills.sql; apps/api/src/modules/conversations/{educational-skills,conversations.service,chat.job,dto/conversations.dto,entities/conversations.entity}.ts; apps/api/src/infrastructure/ai/{provider,run-budget}.ts; apps/web/src/features/chat/StudySkillControls.tsx; apps/web/src/app/conversas/[id]/page.tsx; infra/compose.staging.yaml; .env.example; docs/educational-skills.md.

## Painel de arquivos (pedido adicional)

Refinamento Operate com Impeccable; preservar paleta/tipografia e comportamento atual. Taste orienta coerência onde aplicável. MaterialsPanel.tsx e CSS local próprio: upload com hierarquia clara, contagem de fontes selecionadas, nome/tamanho/estado, ações acessíveis, estados vazios e de erro. Subagentes autorizados: persistência, controles/chat e painel, em arquivos distintos. Root integra provider/orçamento e verifica todos os resultados.
O teste de acessibilidade também exige que entradas animadas estejam visíveis antes da hidratação quando o usuário prefere movimento reduzido. Corrigir os dois textos de apoio da autenticação com contraste insuficiente sem enfraquecer as verificações axe.
