# Convergência documental — 07/10/2026

O código publicado inclui as cinco jornadas da plataforma, métodos educacionais, landing Caderno e editor PDF integrado ao chat. A integração da aula por etapas ainda está parcial. Este documento registra inspeção da implementação atual e evidências disponíveis; não aprova lançamento nem substitui revisão humana.

## Base da avaliação

Lidos spec.md, plan.md e tasks.md das features 001 e 002, constituição 1.0.0, contratos e guias afetados. A feature ativa devolvida pelo check-prerequisites é 001-ai-study-platform. Não há extensions.yml nem hooks de convergência. Ambas as features contêm tarefas geradas e implementadas antes desta avaliação.

Inventário: 21 requisitos funcionais, nove critérios de sucesso e cinco histórias da feature 001; nove requisitos, três critérios e duas histórias da feature 002. SC-001/SC-007 da feature 001 exigem participantes e não são substituídos por testes. Inspecionadas as cinco áreas normativas da constituição e as decisões de autenticação, jobs, IA, materiais, notas, insights, retenção, migrações, PDF e interface. Todos os 96 IDs anteriores da feature 001 e os 18 da feature 002 foram considerados; checkboxes representam histórico, não prova automática de conclusão. A avaliação das lacunas anteriores é estática e usa a evidência histórica; não houve nova avaliação paga ou ensaio operacional.

## Implementação e rastreabilidade

| Área | Evidência no código | Estado e referência |
| --- | --- | --- |
| Acesso e privacidade | módulos auth, DTOs/guards, CSRF/Origin, storage privado e testes de duas contas | Implementado; diagnóstico sanitizado ainda em T081 |
| Chat e personalidade | conversations.service/chat.job, catálogo versionado, histórico, operações e retry | Implementado; T082–T084 continuam abertos |
| Materiais e citações | upload/extract/retrieval, fontes validadas e painel responsivo | Implementado parcialmente frente ao plano completo; T085/T090/T095 |
| Provas e correção | configuração 10–30, schema restrito, gabarito privado, tentativa, rubrica e revisões | Fluxo implementado; qualidade e matriz de aceite em T086/T089/T091 |
| Evolução e prática | cálculo determinístico, filtros, evidências/recomendações e geração com origem | Fluxo implementado; conteúdo de entrada/fallback da recomendação em T087 |
| Skills e profundidade | migration 009, catálogo público/privado, snapshots, provider, controles e flashcards | Feature 002 implementada no escopo próprio; validação histórica em seu validation.md |
| Orçamento de IA | migration 008, run-budget, reservas/tokens, extensão imutável de preços | Implementado; não comprova latência/qualidade nem proveniência completa de T096 |
| Landing Caderno | page.tsx, ChaosJourney, LandingChatDemo, assets/fontes e scripts/check-landing*.mjs | Implementada; evidência visual histórica em docs/landing-page-caderno.md |
| Editor PDF | migrations 010–013, revisão/UUID, IndexedDB, anotação, histórico e exportação | Editor implementado; tutor de aula por etapas parcial em T101–T102 |
| Proteções recentes | docx-limits, limites de páginas/texto/chunks, safe-return-to e security-regressions | Implementadas; não equivalem ao isolamento de extração exigido por T090 |
| Recuperação e retenção | journal, purga, worker e ensaio local em tests/operations | Evidência local histórica; S3/24 h/backup cifrado em T093 |

## Lacunas preservadas

| IDs | Evidência atual | Trabalho restante |
| --- | --- | --- |
| T081 | dispatcher preserva códigos tipados, mas erros comuns viram JOB_FAILED; filtro HTTP não registra diagnóstico da exceção | contexto sanitizado por request/operação e regressões |
| T082 | recoverExpired recoloca em pending; acquire exige attempt_count < 3 | transição terminal recuperável após terceiro lease expirado |
| T083 | histórico é filtrado por existência/versão de materiais, sem cruzar com seleção do novo turno | excluir contexto de materiais desmarcados sem apagar histórico visível |
| T084 | chat.job concatena os segmentos em content e referências globais | preservar distinção source/general/unsupported por segmento |
| T079/T085/T086/T091 | instruções e IDs são validados; avaliação real histórica teve problemas semânticos e crédito parcial | correção e nova avaliação com referências/revisão humana |
| T087 | provider de insights recebe somente IDs, sem conteúdo das respostas e feedback | evidência mínima autorizada e fallback explícito |
| T054/T088 | carga real histórica falhou, com fases incompletas/timeouts | capacidade/latência reais e rodada completa com materiais |
| T089 | testes de limites/schema existem; não há nova evidência da matriz de 100 configurações | execução e registro da matriz completa |
| T090 | PDF.js/Mammoth rodam no worker; limites de conteúdo/ZIP não isolam o processo | extração em processo com limites e restrições de acesso |
| T055/T056/T057/T092/T093 | há instrumentação, E2E/axe e ensaios de recuperação local | revisão humana, leitor de tela e recuperação S3/retention em ambiente próprio |
| T094 | concorrência global por tipo e trava por conversa; tutor PDF tem trava própria | limites atômicos da plataforma por proprietário entre processos |
| T095 | busca vetorial; chunks de 1.200 caracteres sem sobreposição | busca lexical portuguesa, chunking/overlap e cobertura por tema |
| T096 | chat registra modelo configurado e prompt; accounting de ensaio não é envelope persistido de toda geração | modelo retornado, hash/schema/request/tokens/latência por operação |
| T101 | schemas/hooks de aula existem; controller não oferece advance e layout não salva lessons | persistência e avanço de etapas, histórico completo e retomada |
| T102 | layout atual escreve explicações/rótulos em notas e ligações em texto/setas | desenho gráfico por etapa, sem notas de prosa do tutor |
| T103 | E2E remoto não encontra confirmação após solicitar recuperação de senha | diagnosticar o fluxo completo mantendo a proteção contra enumeração |
| T104 | E2E remoto espera Escrever nota e termina por timeout após edição/recuperação | diagnosticar disponibilidade do editor e preservar rascunhos |

As lacunas anteriores não geraram tarefas duplicadas. Foram acrescentadas quatro tarefas HIGH/partial: T101–T102 na inspeção do PDF e T103–T104 após os testes remotos. Também foram acrescentados quatro registros de trabalho implementado, T097–T100. Nenhuma pendência de aceite externo foi marcada como concluída. Não foi detectada lacuna nova específica dos métodos educacionais da feature 002; isso não encerra as lacunas herdadas da plataforma ou o PDF.

## Compatibilidade e integração

Migration 009 usa defaults aditivos para conversas/mensagens. Migrações 010/011 criam as tabelas PDF. Migration 012 requer aplicação parada e recarga dos cursores após importar o histórico, preservando IDs. Migration 013 mantém tentativas do tutor por 24 h mesmo após purga do material e limita payloads de replay antigos. Conservar essas estruturas em rollback; não apagar volumes ou ledger para recuperar versão anterior.

O provider atual retorna etapas; o layout compatível preserva todas as explicações e diagramas como páginas/anotações do formato existente. Essa ponte permite o fluxo atual sem alegar que **Entendi**, aulas salvas ou diagramas por etapa estão completos. O PR #3 integra em dev; promoção para main/produção permanece sujeita ao aceite documentado.

As verificações desta revisão e o resultado do CI estão em [validation.md](validation.md). Relatórios de 29/09–01/10 continuam evidência histórica com seus modelos, ambientes e limitações originais.

O [workflow remoto 37616075392](https://github.com/SekebDev/EducationalProject/actions/runs/37616075392), no commit d1c502b, confirmou os checks até E2E: 12 cenários passaram e dois falharam. As falhas estão em T103–T104; build foi omitido por falha anterior. O [PR #3](https://github.com/SekebDev/EducationalProject/pull/3) permanece aberto. A autorização para merge foi recebida, mas a constituição exige checks aprovados; não foi usado bypass.
