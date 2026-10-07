[CmdletBinding()]
param([switch]$Quality)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$run = 'study-operations-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$db = "$run-db"
$app = "$run-app"
$smtp = "$run-smtp"
$output = Join-Path $root "test-results/operations/$run"
$containerOutput = "/workspace/test-results/operations/$run"
$networkCreated = $false
$created = [System.Collections.Generic.List[string]]::new()

function Invoke-Docker {
    param([string[]]$Arguments)
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker falhou na etapa: $($Arguments[0]) $($Arguments[1])" }
}

function Run-Recovery {
    param([string]$Command, [string]$Database, [string]$Storage)
    Invoke-Docker @('exec', '-e', "DATABASE_URL=postgres://study:study@$db`:5432/$Database", '-e', "STORAGE_LOCAL_PATH=$containerOutput/$Storage", $app, 'node', 'apps/api/node_modules/tsx/dist/cli.mjs', 'tests/operations/local-recovery.ts', $Command)
}

try {
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    Invoke-Docker @('network', 'create', '--internal', $run)
    $networkCreated = $true
    Invoke-Docker @('create', '--name', $db, '--network', $run, '-e', 'POSTGRES_USER=study', '-e', 'POSTGRES_PASSWORD=study', '-e', 'POSTGRES_DB=study_operations_source', 'pgvector/pgvector:pg18')
    $created.Add($db)
    Invoke-Docker @('start', $db)
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        & docker exec $db pg_isready -U study -d study_operations_source *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'PostgreSQL de ensaio não iniciou' }
    Invoke-Docker @('create', '--name', $smtp, '--network', $run, 'axllent/mailpit:v1.27')
    $created.Add($smtp)
    Invoke-Docker @('start', $smtp)
    Invoke-Docker @('create', '--name', $app, '--network', $run, '--workdir', '/app', '--mount', "type=bind,source=$root,target=/workspace", '-e', 'NODE_ENV=test', '-e', 'AI_PROVIDER=fake', '-e', 'STORAGE_DRIVER=local', '-e', 'APP_ORIGIN=http://localhost:3000', '-e', 'SESSION_SECRET=synthetic-operations-secret-1234567890', '-e', "SMTP_HOST=$smtp", '-e', 'SMTP_PORT=1025', '-e', 'SMTP_FROM=study@example.invalid', '-e', "OPERATIONS_OUTPUT_PATH=$containerOutput", 'projeto-educacional:local', 'tail', '-f', '/dev/null')
    $created.Add($app)
    Invoke-Docker @('start', $app)
    Invoke-Docker @('exec', '--user', 'root', $app, 'node', '/workspace/scripts/validation-overlay.mjs')
    Run-Recovery 'prepare' 'study_operations_source' 'source-storage'
    Invoke-Docker @('exec', $db, 'pg_dump', '-U', 'study', '-Fc', '-f', '/tmp/operations.dump', 'study_operations_source')
    Run-Recovery 'delete' 'study_operations_source' 'source-storage'
    Invoke-Docker @('exec', $db, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'study', '-d', 'study_operations_source', '-c', "COPY deletion_record TO '/tmp/deletions.csv' WITH CSV HEADER")
    Invoke-Docker @('exec', $db, 'createdb', '-U', 'study', 'study_operations_restore')
    Invoke-Docker @('exec', $db, 'pg_restore', '-U', 'study', '-d', 'study_operations_restore', '/tmp/operations.dump')
    Invoke-Docker @('exec', $db, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'study', '-d', 'study_operations_restore', '-c', "COPY deletion_record FROM '/tmp/deletions.csv' WITH CSV HEADER")
    Get-Content (Join-Path $root 'scripts/replay-deletions.sql') -Raw | & docker exec -i $db psql -v ON_ERROR_STOP=1 -U study -d study_operations_restore
    if ($LASTEXITCODE -ne 0) { throw 'Replay do journal falhou' }
    Run-Recovery 'restore' 'study_operations_restore' 'restored-storage'
    if ($Quality) {
        Invoke-Docker @('exec', $db, 'createdb', '-U', 'study', 'study_operations_quality')
        $environment = @('-e', "DATABASE_URL=postgres://study:study@$db`:5432/study_operations_quality", '-e', "TEST_DATABASE_URL=postgres://study:study@$db`:5432/study_operations_quality", '-e', 'STORAGE_LOCAL_PATH=/app/test-results/operations-storage')
        foreach ($command in @(
            @('node', 'node_modules/eslint/bin/eslint.js', '.'),
            @('node', 'node_modules/typescript/bin/tsc', '-p', 'apps/api/tsconfig.json', '--noEmit'),
            @('node', 'node_modules/typescript/bin/tsc', '-p', 'apps/web/tsconfig.json', '--noEmit'),
            @('node', '--test', 'tests/load/measurement.spec.mjs', 'tests/evaluations/score.spec.mjs'),
            @('node', 'node_modules/vitest/vitest.mjs', 'run'),
            @('node', 'apps/api/node_modules/tsx/dist/cli.mjs', 'tests/evaluations/collect.ts', '--dry-run'),
            @('node', 'node_modules/typescript/bin/tsc', '-p', 'apps/api/tsconfig.build.json'),
            @('node', 'apps/web/node_modules/next/dist/bin/next', 'build', 'apps/web')
        )) {
            Invoke-Docker (@('exec') + $environment + @($app) + $command)
        }
    }
    Write-Output "Ensaios locais aprovados. Relatórios: $output"
} finally {
    # Only exact container names created in this run are removed, including their
    # anonymous test volumes. No workspace paths or existing volumes are deleted.
    foreach ($container in $created) { & docker rm -f -v $container *> $null }
    if ($networkCreated) { & docker network rm $run *> $null }
}
