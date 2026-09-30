# Direção visual do Caderno

Estúdio de aprendizagem com composição editorial: títulos expressivos, superfícies de papel quente, verde profundo, detalhes em sálvia e damasco. A interface apresenta uma identidade consistente desde a entrada até a correção de uma prova. Perguntas, respostas e evidências continuam sendo o conteúdo principal.

## Sistema visual

- Fundo `#F8F5EE`, folha `#FFFEFA`, tinta `#1D352D`, texto secundário `#66716A`.
- Ação `#173D32`, sálvia `#DCE8D6`, damasco `#E9A77C`, erro `#A52D35`, foco `#326A53`.
- DM Sans Variable no corpo e Fraunces Variable nos títulos editoriais. Ambas são hospedadas pelo próprio aplicativo, sem busca de fontes durante o build.
- Escala de espaços de 4 px, campos e ações com altura confortável, raios menores em controles e maiores em superfícies principais. Sombras suaves distinguem camadas.
- Navegação lateral escura, cabeçalho claro, páginas com títulos fortes, formulários organizados em etapas e resultados com leitura rápida e evidências acessíveis.

## Componentes

O projeto usa componentes oficiais de [shadcn/ui](https://ui.shadcn.com) obtidos pelo registro: Button, Card, Badge, Progress, Sheet e DropdownMenu. Os componentes [Magic UI](https://magicui.design) BlurFade e NumberTicker apoiam a entrada das seções e a apresentação dos indicadores. Tailwind integra as classes dos componentes; módulos CSS tratam a composição específica dos fluxos.

Os campos têm rótulos persistentes, os botões descrevem ações e o foco permanece visível. A conversa distingue estudante e IA, apresenta materiais como apoio e abre fontes junto da citação. As provas mostram progresso, navegação por questão e estados de salvamento. A evolução identifica níveis e mantém a tabela equivalente ao gráfico.

## Chat e evolução

O chat segue a estrutura solicitada do ChatGPT: coluna de mensagens central, perguntas em balões à direita, respostas do professor sobre a superfície de leitura e caixa de escrita sempre disponível na parte inferior. O menu de personalidade ocupa a posição do seletor de modelos, no canto superior esquerdo da área principal. Arquivos enviados ficam no painel à direita; no celular, abrem em um painel próprio. A marca e os nomes continuam sendo os do Caderno.

A evolução organiza resultados reais em um resumo, gráfico por data e nível, temas e próximas práticas. Filtros compactos e evidências expansíveis deixam a leitura principal mais clara. Não apresentar estimativas ou progresso inventado como resultados do estudante.

## Movimento

Motion organiza entradas de seções, transições de navegação, microinterações de controles e mudanças de estado. Os blocos chegam em sequência curta; ações respondem ao hover e ao toque; indicadores animam até o valor real. Transformações e opacidade são preferidas para evitar deslocamentos no layout. `prefers-reduced-motion` apresenta o conteúdo imediatamente e remove movimentos decorativos.

## Responsividade e validação

A navegação vira menu móvel em telas estreitas. Composições assimétricas passam para uma coluna, os controles quebram de forma previsível e os textos continuam legíveis a 360 px. O editor de conversa fica acessível durante a leitura; fontes, menus e expansões mantêm gestão de foco. Os testes verificam contraste, foco por teclado, axe e ausência de rolagem horizontal em 360, 768, 1024 e 1440 px. As capturas dos fluxos ficam nos artefatos E2E.
