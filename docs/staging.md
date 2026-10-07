# Staging local isolado

`infra/compose.staging.yaml` cria a stack `study-staging`, com PostgreSQL e arquivos próprios, sem publicar a porta do banco. Web: http://localhost:3200; API: http://localhost:3201/api/v1/health. Use contas e materiais sintéticos. A stack de desenvolvimento em 3000/3001 permanece independente.

O staging aceita explicitamente as origens http://localhost:3200 e http://127.0.0.1:3200. APP_ORIGIN é o endereço canônico usado nos links de recuperação; APP_ADDITIONAL_ORIGINS permite uma lista separada por vírgulas de origens adicionais exatas, sem caminhos ou curingas. Por padrão a lista é vazia. Ambos os endereços exigem cookie e token CSRF correspondentes; outros hosts, protocolos ou portas continuam bloqueados. Não use essa configuração para autorizar origens arbitrárias.

Correção verificada em 2026-10-02: o cadastro e o login em 127.0.0.1 recebiam 403 porque apenas localhost estava autorizado. Após acrescentar a origem exata, smoke no navegador do staging confirmou cadastro 201, login 200 e logout nos dois endereços; origem externa e token inválido continuaram retornando 403. Contas sintéticas removidas após a verificação; nenhuma chamada de IA. Artefato privado: test-results/staging/auth-origin-smoke.json. Checks finais: 39 arquivos/173 testes Vitest, tipos, ESLint, Prettier e build API/Next passaram. Novas regressões cobrem alias opt-in, portas/protocolos/hosts não autorizados, ausência ou divergência do token e configuração inválida. API/worker atualizados sem alterações ao banco, arquivos ou orçamento.

Mantenha `.env` existente com os segredos de backend. Crie `.env.staging-run` (ignorado) uma vez por orçamento autorizado:

```dotenv
STAGING_AI_RUN_ID=UUID-DA-RODADA
STAGING_AI_PROVIDER=fake
STAGING_AI_BUDGET_USD=0.15
```

Gere o UUID com `[Guid]::NewGuid().ToString()`. Preserve o ID entre reinícios: trocar o ID cria outro ledger e não representa autorização para gastar novamente. Nesta sessão, US$ 0,05 do teto de US$ 0,20 foram reservados conservadoramente para uma coleta cujo artefato se perdeu; as chamadas seguintes compartilham o ledger de US$ 0,15.

```powershell
docker compose --env-file .env.staging-run -f infra/compose.staging.yaml build web
docker compose --env-file .env.staging-run -f infra/compose.staging.yaml up -d
docker compose --env-file .env.staging-run -f infra/compose.staging.yaml ps
```

O modo padrão é fake. Para um ensaio real autorizado, altere `STAGING_AI_PROVIDER=openai` e recrie API/worker com `up -d --no-deps api worker`. Segredos não são passados ao frontend. Nesta sessão, o usuário pediu testar a IA real; API/worker continuam em openai sob o mesmo ledger. Para retornar a demonstração sem cobrança, volte a fake e recrie esses dois serviços. O ledger PostgreSQL conserva gasto e reservas no volume; cada chamada reserva seu custo máximo antes de enviar ao provedor. Timeout com uso desconhecido mantém a reserva cobrada; processo interrompido mantém o saldo reservado. A trava não cobre chamadas feitas por outros aplicativos ou stacks.

O modelo de texto padrão é gpt-6-luna. Seu preço no ledger é conservador: US$ 0,125 por milhão de tokens de entrada, cobrindo também cache writes sem descontos, e US$ 0,50 de saída. [Modelo oficial GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna). O catálogo mantém os preços históricos do nano e embeddings e permite somente acrescentar modelos, sem alterar o teto ou apagar gastos. Confira os preços antes de uma rodada futura. Alterar o teto exige novo orçamento autorizado.

```powershell
docker compose --env-file .env.staging-run -f infra/compose.staging.yaml exec -T db psql -U study -d study_staging -c "SELECT id,max_micro_usd,spent_micro_usd,reserved_micro_usd FROM ai_run_budget"
```

Divida por 1.000.000 para USD. Relatórios privados ficam em `test-results/staging/`; os resumos versionados estão em `specs/001-ai-study-platform/validation.md` e `specs/002-educational-skills/validation.md`. `docker compose ... stop` preserva volumes e orçamento. Não remova volumes para reiniciar o saldo de uma autorização existente.

O smoke `scripts/staging-skills-smoke.mjs` deve ser enviado pela entrada padrão ao Node no container API existente, em `/app/apps/api`; usa as credenciais e o ledger já configurados. O caso padrão é um resumo de R básico; `STAGING_SMOKE_CASE=derivatives` seleciona derivadas. O relatório inclui resposta final após o guard, uso e saldo, sem credenciais. Verifique saldo antes de executar; um smoke é uma chamada paga.

Para carga, use k6 ou a imagem `grafana/k6:1.3.0`, na rede `study-staging_default`, montando a raiz em `/workspace`, com `BASE_URL=http://web:3000`, `APP_ORIGIN=http://localhost:3200`, `RUN_ID` único e `MODE=fake`. Execute `tests/load/study.js`. Modo real exige também `REAL_RUN_ACK=1` e `MAX_BUDGET_USD` compatível com o ledger. Preserve cada relatório antes da próxima rodada. As quatro fases e contagens mínimas, inclusive falhas, determinam o resultado.
