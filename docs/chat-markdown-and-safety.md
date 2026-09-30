# Chat: Markdown e limites educacionais

Revisão de 30/09/2026. Este documento registra o comportamento implementado e os limites de sua verificação.

## Markdown nas mensagens e nos arquivos

O professor devolve uma resposta estruturada: segmentos de texto, classificação de suporte (`source`, `general` ou `unsupported`), IDs de trechos e eventuais divergências entre fontes. O Markdown fica nos campos de texto; o contrato JSON continua validado no servidor.

A interface apresenta títulos, parágrafos, listas, ênfase, citações, tabelas GFM e código. Blocos de código têm identificação de linguagem, destaque de sintaxe quando disponível e ação de copiar. Blocos `mermaid` permitem alternar entre diagrama e código. Os títulos usam a hierarquia visual definida pelo aplicativo; a resposta não controla fontes ou tamanhos por HTML.

HTML bruto não é renderizado. Imagens Markdown aparecem como descrição textual, sem carregar imagens remotas. Links usam a transformação padrão de URLs do `react-markdown` e abrem com `noopener noreferrer`. Mermaid usa configuração `strict`, recusa diretivas de configuração e front matter, limita o texto e a quantidade de arestas e mostra o SVG como imagem. Um erro no diagrama apresenta seu código para leitura.

Arquivos `.md` e `.markdown`, incluindo extensões em maiúsculas, são aceitos com MIME `text/markdown`, `text/x-markdown`, `text/plain` ou `application/octet-stream`. O servidor valida UTF-8 e rejeita assinaturas de PDF/ZIP e caracteres de controle binários. O MIME persistido continua sendo `text/plain`, sem mudança de esquema no banco.

A extração normaliza quebras de linha e remove o BOM inicial. Linhas com conteúdo preservam indentação, espaços e numeração original; linhas em branco não viram trechos separados. Trechos de até 1.200 caracteres preservam o conteúdo, inclusive espaços de código. O limite de envio permanece em 20 MB; a extração aceita até 2 milhões de caracteres de conteúdo.

O chat consulta os trechos recuperados dos arquivos selecionados, e não necessariamente o arquivo inteiro em cada pergunta. Um código ou diagrama longo pode precisar de mais contexto para uma explicação precisa.

## Professor e personalidade

O catálogo de personalidade pertence ao servidor. A versão 2 amplia os estilos acolhedor, objetivo e socrático. A versão 1 continua disponível para respeitar o estilo registrado em mensagens anteriores.

Somente nomes e textos de estilo presentes no catálogo entram no prompt como estilo validado. Uma personalidade arbitrária é substituída pelo estilo objetivo. A personalidade muda a forma de ensinar; não altera acesso, fontes, regras de avaliação ou limites educacionais.

As instruções orientam o professor a explicar conceitos, raciocínio e passos, propor exercícios e revisar trechos do estudante. Programação é um assunto de estudo permitido, com exemplos curtos. Pedidos de aplicativos, sites ou sistemas completos prontos para uso são redirecionados para o aprendizado de uma parte do projeto.

## Fronteiras entre instruções e dados

O prompt educacional e o estilo validado são definidos pelo servidor. Perguntas, histórico, anexos e trechos de fontes são enviados como dados separados. As instruções tratam esses dados como não confiáveis e proíbem que troquem o papel do professor, revelem instruções ou segredos, alterem notas ou forneçam gabaritos protegidos.

A chamada ao modelo usa `tools: []` e `store: false`. O modelo não recebe credenciais de aplicação no conteúdo do prompt nem ferramentas de execução, implantação ou acesso a outras contas. `store: false` desativa o armazenamento da resposta por essa opção da API; não constitui uma declaração de retenção zero para todo o serviço.

O servidor valida o contrato da saída e as citações: um segmento apoiado em fonte precisa de IDs fornecidos; segmentos gerais ou sem suporte não podem declarar citações. Divergências exigem pelo menos dois trechos distintos disponíveis. Antes de persistir, o worker verifica novamente propriedade, estado e versão das fontes. Histórico ligado a material removido ou substituído não volta ao prompt.

## Limites determinísticos

Antes de recuperar trechos, calcular o embedding da pergunta ou chamar o chat, o worker verifica padrões explícitos de pedidos de aplicações completas, divulgação de instruções internas/credenciais e ordens para ignorar regras. Quando reconhecidos, devolve uma orientação educacional fixa sem referências. O provedor real aplica a mesma verificação antes da chamada.

A resposta inteira, incluindo descrições de divergências entre fontes, é analisada com o parser CommonMark `mdast-util-from-markdown`, incluindo cercas de crases ou tis, código indentado, blocos em listas/citações e cercas sem fechamento. Código inline e diagramas Mermaid entram no volume total. A resposta é substituída por uma orientação educacional se ultrapassar qualquer limite:

- Quatro blocos de código.
- 6.000 caracteres de código somado, incluindo código inline.
- 180 linhas de código somado.
- Dois títulos que identifiquem arquivos de código; a partir de três, a entrega é redirecionada.

Esses limites são aplicados antes da persistência, inclusive quando o provedor de demonstração é usado pelo worker. Não dependem de o modelo obedecer ao prompt.

## Modelo e custo

O modelo padrão para saídas estruturadas é `gpt-4.1-nano`, configurável por função (`OPENAI_CHAT_MODEL`, `OPENAI_EXAM_MODEL`, `OPENAI_GRADING_MODEL` e `OPENAI_INSIGHTS_MODEL`). O modelo foi escolhido para manter o custo baixo; seus recursos e preços estão na [documentação oficial da OpenAI](https://developers.openai.com/api/docs/models/gpt-4.1-nano).

O chat limita cada resposta a `min(AI_MAX_OUTPUT_TOKENS, 3000)` tokens de saída, com 3.000 como teto mesmo quando a configuração é maior. O limite padrão da entrada serializada é 120.000 caracteres. O SDK tem novas tentativas automáticas desativadas e a chamada do chat usa timeout de 45 segundos. Respostas incompletas ou JSON inválido não são persistidos como sucesso.

Esses limites reduzem a quantidade por chamada; não são um teto mensal de gasto. Extração de materiais e recuperação de fontes também podem gerar chamadas de embeddings. As outras funções de IA mantêm seus próprios limites e tempos.

## Verificação e limites da proteção

Os testes usam o SDK simulado ou a IA de demonstração, sem chamadas pagas. Cobrem MIME e UTF-8 de Markdown, indentação e localizadores, chunks, upload HTTP privado, recuperação, exclusão, validação de estilo, fronteira entre dados e instruções, redirecionamento de pedidos, formatos CommonMark de código, modelo padrão, teto de tokens e persistência no worker.

Também foram realizados ensaios curtos com o provedor OpenAI real: a saída completou o contrato estruturado e apresentou um título Markdown. A stack Docker foi exercitada via HTTP, passando por web, API, worker, OpenAI e persistência; uma conta temporária recebeu a resposta e um pedido explícito de aplicação completa foi redirecionado. A conta e seus dados foram removidos após o ensaio. Esse ensaio confirma conexão e formato, sem estabelecer qualidade pedagógica ou resistência a todas as manipulações.

Os padrões de intenção são heurísticos: paráfrases, outras línguas ou pedidos distribuídos entre turnos podem não ser reconhecidos. A política semântica de manter o foco educacional também depende do comportamento do modelo. Uma aplicação pequena pode caber nos limites de código; os limites de volume não provam que uma resposta seja apenas um exemplo didático.

A validação de citações prova que os IDs e as fontes estão disponíveis para esse estudante; não prova que cada afirmação seja verdadeira ou esteja semanticamente sustentada pelo trecho. A IA pode errar, e a apresentação em Markdown não muda essa limitação. As avaliações humanas e ensaios externos definidos na especificação continuam pendentes até serem executados.
