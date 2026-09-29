# Rastreabilidade V01–V18

Os testes usam IA fake, `TEST_DATABASE_URL` isolado e contas/IDs sintéticos. Os casos de navegador usam Edge via Playwright em 3100/3101. O corpus pedagógico real fica fora desta suíte.

| Caso | Evidência automatizada                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V01  | `tests/e2e/chat.spec.ts`, `apps/api/test/conversations/chat.integration.spec.ts`                                                                                    |
| V02  | `apps/api/test/conversations/chat.integration.spec.ts`, `apps/api/test/jobs/operations.integration.spec.ts`                                                         |
| V03  | `apps/api/test/materials/upload.spec.ts`, `extract.spec.ts`, `tests/e2e/materials.spec.ts`                                                                          |
| V04  | `apps/api/test/conversations/sources.spec.ts`, `tests/e2e/materials.spec.ts`, `apps/api/test/ai/hostile-content.spec.ts`                                            |
| V05  | `apps/api/test/exams/exam-config.spec.ts`, `generation.spec.ts`, `tests/e2e/exams.spec.ts`                                                                          |
| V06  | `apps/api/test/exams/secrecy.spec.ts`, `tests/contract/exams.spec.ts`                                                                                               |
| V07  | `apps/api/test/attempts/attempts.integration.spec.ts`                                                                                                               |
| V08  | `apps/api/test/grading/grade.integration.spec.ts`, `apps/api/test/ai/hostile-content.spec.ts`                                                                       |
| V09  | `apps/api/test/attempts/attempts.integration.spec.ts`, `tests/e2e/exams.spec.ts`                                                                                    |
| V10  | `apps/api/test/attempts/attempts.integration.spec.ts`, `tests/e2e/exams.spec.ts`                                                                                    |
| V11  | `apps/api/test/insights/calculation.spec.ts`, `insights.integration.spec.ts`                                                                                        |
| V12  | `apps/api/test/attempts/attempts.integration.spec.ts`, `tests/e2e/exams.spec.ts`                                                                                    |
| V13  | `apps/api/test/insights/calculation.spec.ts`, `insights.integration.spec.ts`, `tests/e2e/insights.spec.ts`                                                          |
| V14  | `apps/api/test/insights/practice.spec.ts`, `apps/api/test/exams/practice-generation.spec.ts`, `tests/e2e/practice.spec.ts`                                          |
| V15  | `apps/api/test/deletion/purge.integration.spec.ts`, `tests/e2e/materials.spec.ts`, `tests/e2e/insights.spec.ts`                                                     |
| V16  | `apps/api/test/jobs/operations.integration.spec.ts` (retry e fence; desligamento físico do worker ainda é ensaio operacional)                                       |
| V17  | `tests/e2e/accessibility.spec.ts` (cinco telas em 360/1440 px; revisão manual com leitor de tela pendente)                                                          |
| V18  | `apps/api/test/migrate.integration.spec.ts`, `apps/api/test/deletion/purge.integration.spec.ts` (replay do journal; restore completo do bucket em staging pendente) |

Execução real em staging é necessária para afirmar p95, custo, qualidade pedagógica, leitor de tela e restore do bucket S3. O comando `test:evaluations` prepara a revisão humana e `test:load` requer k6 instalado; nenhuma dessas medições deve ser confundida com os testes fake.
