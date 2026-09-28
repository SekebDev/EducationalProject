# EducationalProject

Plataforma de estudos com professor de IA. A [especificação](specs/001-ai-study-platform/spec.md) e o [plano de implementação](specs/001-ai-study-platform/plan.md) descrevem o produto e sua construção.

## Fluxo de desenvolvimento

`main` representa a versão de produção. `dev` é a base de integração do trabalho em andamento. Cada funcionalidade começa em uma branch `feat/<nome>` criada a partir da `dev` atualizada. Após revisão e verificações aplicáveis, a feature é integrada em `dev`. A promoção de `dev` para `main` ocorre somente quando a versão estiver pronta para produção.

```bash
git fetch origin
git switch dev
git pull --ff-only origin dev
git switch -c feat/nome-da-funcionalidade
```

Commits seguem [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/), com mensagens como `feat(chat): salvar conversas` e `fix(exams): impedir pontuação duplicada`. Commits de integração também usam esse formato. Antes de integrar, execute os testes e checks relevantes à mudança; não apresente verificações não executadas como aprovadas.

Publicar a branch de feature e integrar em `dev` após a revisão. Manter `main` sem mudanças de desenvolvimento até a decisão de publicação.
