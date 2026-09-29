# Avaliação pedagógica

`pnpm test:evaluations` valida o corpus sintético inicial e cria um relatório com notas vazias. Ele não consulta IA real. Para SC-004/005, prepare um arquivo JSONL privado com pelo menos 30 respostas fundamentadas em fontes e 30 correções discursivas produzidas pelo sistema em staging e revisadas por uma pessoa competente no conteúdo. Não use material pessoal. Registre o modelo, versão do prompt, commit, data, configuração e origem do custo junto ao arquivo privado.

Cada linha precisa de `id`, `kind`, `latencyMs` e `costUsd`. Uma revisão de fonte usa `kind:"source"`, `humanSupported`, `locatorExists` e `unsupportedExplicit`. Uma revisão discursiva usa `kind:"essay"`, `humanPoints`, `aiPoints` (ambos de 0 a 1) e `criteriaJustified`. Os booleanos são julgamento humano, não inferência automática. Exemplos de formato:

```jsonl
{"id":"fonte-01","kind":"source","latencyMs":1200,"costUsd":0.004,"humanSupported":true,"locatorExists":true,"unsupportedExplicit":true}
{"id":"discursiva-01","kind":"essay","latencyMs":2500,"costUsd":0.006,"humanPoints":0.7,"aiPoints":0.8,"criteriaJustified":true}
```

Após a coleta, defina o teto aprovado e calcule o relatório:

```powershell
$env:EVALUATION_MAX_USD = '10'
$env:EVALUATION_DATASET_LABEL = 'staging-2026-09-29-revisao-humana'
pnpm test:evaluations:score .\caminho-privado\revisoes.jsonl
```

O comando exige 30 linhas de cada tipo, IDs únicos, dados completos e custo/latência numéricos. Ele grava somente agregados e o rótulo do conjunto em `test-results/evaluations/scored-report.json`, retorna erro se SC-004, SC-005 ou o teto falhar e não substitui a revisão humana. O teto é verificado sobre custos já registrados; monitore e limite as chamadas ao provedor durante a coleta.
