# Avaliação pedagógica

`pnpm test:evaluations` valida o corpus inicial sem chamadas externas. `pnpm test:evaluations:collect --dry-run` prepara 60 casos sintéticos: dez temas, cada um com três perguntas com fontes (coberta/hostil/conflitante) e três discursivas (completa/parcial/hostil). O coletor real usa prompts, schemas e validadores da aplicação; seu escopo é provider/prompt/validação, sem upload, busca vetorial ou carga HTTP. SC-004/005 exigem revisão humana de pelo menos 30 casos de cada tipo. Revisão pelo agente é registrada separadamente com `reviewerType="agent"`; campos humanos permanecem `null`.

Cada linha precisa de `id`, `kind`, `latencyMs` e `costUsd`. Uma revisão de fonte usa `kind:"source"`, `humanSupported`, `locatorExists` e `unsupportedExplicit`. Uma revisão discursiva usa `kind:"essay"`, `humanPoints`, `aiPoints` (ambos de 0 a 1) e `criteriaJustified`. Os booleanos são julgamento humano, não inferência automática. Exemplos de formato:

```jsonl
{"id":"fonte-01","kind":"source","latencyMs":1200,"costUsd":0.004,"humanSupported":true,"locatorExists":true,"unsupportedExplicit":true}
{"id":"discursiva-01","kind":"essay","latencyMs":2500,"costUsd":0.006,"humanPoints":0.7,"aiPoints":0.8,"criteriaJustified":true}
```

Após a coleta, defina o teto aprovado e calcule o relatório:

```powershell
$env:EVALUATION_MAX_USD = '0.15'
$env:EVALUATION_DATASET_LABEL = 'staging-2026-09-29-revisao-humana'
pnpm test:evaluations:score .\caminho-privado\revisoes.jsonl
```

O comando exige 30 linhas de cada tipo, IDs únicos, dados completos, ausência de falhas e custo/latência numéricos. Grava agregados em `test-results/evaluations/scored-report.json` e retorna erro se SC-004, SC-005 ou o teto falhar. Não substitui a revisão humana ou a trava anterior às chamadas.

## Coleta real com teto

```powershell
$env:EVALUATION_REAL_ACK = '1'
$env:EVALUATION_MAX_USD = '0.15'
$env:EVALUATION_MODEL = 'gpt-4.1-nano'
$env:EVALUATION_INPUT_USD_PER_MILLION = '0.10'
$env:EVALUATION_OUTPUT_USD_PER_MILLION = '0.40'
$env:EVALUATION_PRICE_SOURCE = 'https://developers.openai.com/api/docs/models/gpt-4.1-nano'
pnpm test:evaluations:collect
```

Execute em ambiente isolado com chave e teto autorizados. Configurar `AI_RUN_BUDGET_ID`, `AI_RUN_BUDGET_USD` e `AI_RUN_PRICES_JSON` integra coleta e workers ao mesmo ledger persistente PostgreSQL; o staging desta sessão já os configura (`docs/staging.md`). Não crie novo ID para contornar saldo consumido. Timeout sem usage conserva o custo máximo reservado.

Cada rodada grava metadata, reviews JSONL e summary em diretório privado ignorado sob `test-results/evaluations/`; no Compose, aparece em `test-results/staging/evaluations/`. Cada linha contém entrada, saída, erro, latência, modelo/schema, tokens e custo. Falhas continuam no arquivo e impedem aprovação. Playwright escreve em `test-results/e2e`, sem apagar essas evidências. `pnpm test:instruments` verifica contabilização e rejeição de evidência incompleta.

Localizadores válidos não comprovam suporte semântico. Compare afirmações ao trecho citado e confira conflitos e ausência explícita de suporte. Avalie a rubrica/referência antes de comparar notas; não use a própria nota da IA como referência humana.
