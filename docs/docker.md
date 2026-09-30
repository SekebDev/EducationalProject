# Rodar tudo com Docker

O Docker inicia o site, a API, o processamento em segundo plano, PostgreSQL com
pgvector e uma caixa de e-mail local. Não precisa instalar Node.js ou pnpm no
computador. Requer Docker Desktop em modo de containers Linux.

## Iniciar

Na raiz do projeto, mantenha seu `.env`. Se ainda não existir, copie
`.env.example` para `.env` e substitua `SESSION_SECRET` por um valor aleatório de
pelo menos 32 caracteres.

Para usar a IA real, configure `AI_PROVIDER=openai` e `OPENAI_API_KEY` no `.env`.
Os modelos de texto padrão são `gpt-4.1-nano`; embeddings usam
`text-embedding-3-small`. As chamadas à OpenAI seguem a cobrança da sua conta.
A chave fica disponível somente para a API e o worker em execução; o arquivo
`.env` é excluído da imagem e não é enviado para o frontend.

```powershell
docker compose --env-file .env -f infra/compose.yaml up -d --build
```

As migrações do banco são aplicadas antes da API e do worker. O site começa após
a API estar pronta. Nenhum usuário de teste é criado automaticamente.

- Site: [localhost:3000](http://localhost:3000)
- Caixa de e-mail: [localhost:8025](http://localhost:8025)
- Estado da API: [localhost:3001/api/v1/health](http://localhost:3001/api/v1/health)

Use `localhost` no endereço do site: a proteção das sessões valida a origem
configurada. As portas publicadas ficam restritas a `127.0.0.1`.

## Acompanhar e atualizar

```powershell
docker compose --env-file .env -f infra/compose.yaml ps
docker compose --env-file .env -f infra/compose.yaml logs --tail 100 -f web api worker
```

Depois de alterar o código, execute novamente o comando de início com `--build`.
Depois de alterar somente a chave ou o modelo no `.env`, recrie API e worker:

```powershell
docker compose --env-file .env -f infra/compose.yaml up -d --force-recreate api worker
```

Para parar sem remover o banco ou os arquivos:

```powershell
docker compose --env-file .env -f infra/compose.yaml stop
```

## Portas ocupadas

Se o site já estiver rodando fora do Docker, encerre esses processos ou escolha
outras portas para web e API. Ao mudar a porta do site, ajuste também a origem:

```powershell
$env:DOCKER_WEB_PORT = '3200'
$env:DOCKER_API_PORT = '3201'
$env:DOCKER_APP_ORIGIN = 'http://localhost:3200'
docker compose --env-file .env -f infra/compose.yaml up -d --build
```

Nesse caso, abra `http://localhost:3200`. API e web continuam se comunicando
pelos nomes e portas internos dos containers. Mantenha as mesmas variáveis nos
comandos seguintes para não voltar às portas padrão sem querer.

## Dados e escopo

O volume existente `study-db` é preservado. Os arquivos enviados por esta stack
ficam no novo volume `study-files`, compartilhado entre API e worker. Arquivos
que já estavam no diretório `.local-storage` do computador não são copiados
automaticamente para esse volume.

Se já usava a API fora dos containers, copie os anexos do diretório da API
para o volume, sem sobrescrever os arquivos existentes. Mantenha a origem intacta:

```powershell
$sourceUploads = (Resolve-Path -LiteralPath 'apps/api/.local-storage').Path
docker run --rm --user 0 --mount "type=bind,source=$sourceUploads,target=/import,readonly" --mount 'type=volume,source=infra_study-files,target=/app/storage' projeto-educacional:local sh -c 'cp -an /import/. /app/storage/ && chown -R node:node /app/storage'
```

O nome `infra_study-files` corresponde ao projeto Compose padrão. Se você usa
`--project-name`, ajuste o prefixo do volume. Caso tenha definido outro caminho
em `STORAGE_LOCAL_PATH`, use esse caminho como origem.

Esta configuração é para uso local: a API usa o modo de desenvolvimento para
permitir armazenamento local e sessões HTTP; o frontend roda a versão compilada
do Next.js. Para publicação, o projeto exige HTTPS, provedor de IA real,
armazenamento S3 privado e configuração própria de produção. Consulte também
[a operação](operations.md).

Para usar somente PostgreSQL e e-mail enquanto desenvolve fora do Docker:

```powershell
docker compose -f infra/compose.yaml up -d db smtp
```
