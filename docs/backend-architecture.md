# Backend NestJS

Os modulos da API ficam em `apps/api/src/modules`. Controllers recebem entradas,
servicos aplicam regras de negocio e consultas PostgreSQL filtram os recursos pelo
proprietario. O NestJS CLI pode gerar novos modulos, mas nao e necessario para executar
a API: os scripts do workspace usam `tsx` e `tsc`.

## DTOs e validacao

As pastas `dto` definem os schemas Zod e os tipos de entrada inferidos desses schemas.
`ZodValidationPipe` valida o corpo antes de executar o controller, rejeita propriedades
extras conforme cada schema e preserva o formato publico de erros HTTP 422. Nao ha
dependencia de metadata de classes para validar entradas.

`ResourceIdPipe` valida parametros UUID e retorna HTTP 404 para IDs invalidos.
Regras que dependem do banco, como disponibilidade de materiais, propriedade e temas
recomendados, continuam nos servicos. Os parsers de provas e praticas tambem validam
chamadas internas entre servicos, incluindo a distribuicao das questoes.

## Autenticacao

Controllers protegidos usam `@UseGuards(SessionGuard)`. O guard valida o cookie
`study_session` em cada requisicao, incluindo expiracao e revogacao, e disponibiliza
o aluno com `@CurrentStudent()`. O decorator retorna HTTP 401 se nao houver aluno
autenticado. Novos controllers privados devem importar `AuthModule` e aplicar o guard.

Cadastro, login, recuperacao de senha, emissao de CSRF e health check permanecem
publicos. Logout permite limpar um cookie mesmo quando a sessao ja expirou. O middleware
CSRF e os limites de login e recuperacao de senha continuam ativos. Autenticacao nao
substitui os filtros de proprietario nas consultas dos servicos.

## Entidades e persistencia

As pastas `entities` nomeiam os tipos de registros e projecoes usados pelos servicos:
alunos, conversas, mensagens, materiais, provas, tentativas, respostas e resultados.
Esses tipos descrevem as colunas selecionadas; nao implicam que todas as colunas de uma
tabela foram carregadas. DTOs descrevem entradas HTTP, entidades descrevem dados lidos
do banco e respostas publicas continuam sendo montadas explicitamente pelos servicos.

O acesso permanece com `pg` e migracoes SQL versionadas. As consultas existentes usam
locks, controle de versao, isolamento por proprietario e transacoes que coordenam
operacoes e idempotencia. Um ORM so deve ser introduzido com um escopo de migracao
definido, preservando essas garantias e comprovando-as nos testes de banco; esta
refatoracao nao altera o esquema nem requer migracao dos dados.

## Verificacao

`pnpm --filter @study/api typecheck` e `pnpm --filter @study/api build` verificam a API.
`pnpm test:unit` e `pnpm test:contract` exercitam parsers e contratos.
`pnpm test:integration` inclui os testes HTTP de guards e DTOs com servicos substituidos
por doubles. Os testes de persistencia exigem `TEST_DATABASE_URL` para um banco isolado.
