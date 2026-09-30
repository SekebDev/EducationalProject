# Direção visual do Caderno

Interface de estudo com linguagem de caderno: folha clara, margem fina, leitura contínua e pequenos sinais de anotação. A ornamentação permanece fora da área de respostas e não sugere que o professor de IA seja humano.

## Referências aplicadas

- [dark.design](https://www.dark.design): contraste forte e título editorial no convite inicial, concentrados no painel de abertura.
- [Mobbin](https://mobbin.com): fluxos de entrada e navegação com ações reconhecíveis e continuidade entre telas.
- [BentoGrids](https://bentogrids.com): composição assimétrica de blocos no estado inicial, com exemplos de perguntas como conteúdo real.
- [Land-book](https://land-book.com): superfícies claras, espaços generosos e hierarquia legível no restante do produto.

O chat conserva a folha clara e a largura de leitura. A prova, o resultado e a evolução usam a mesma hierarquia; o gráfico tem tabela com os mesmos valores e identifica níveis separadamente.

## Tokens

- Fundo `#F7F7F2`, folha `#FFFFFF`, tinta `#202A27`, texto secundário `#53615A`.
- Ação `#1E5B49`, borda `#D5DDD6`, erro `#A52D35`, aviso `#775A17`, foco `#134FBC`.
- Tipografia Source Sans 3 quando disponível, com Segoe UI e sans-serif como fallback. Corpo 16 px; títulos em escala curta e sem peso decorativo.
- Raio de 7 a 10 px, linhas discretas e sombra apenas no drawer móvel.

## Componentes e movimento

Botões e links são nomeados por ações, campos têm rótulo persistente, estados informam o próximo passo. O chat apresenta mensagem do estudante e resposta da IA em leitura contínua. O seletor de personalidade explica o método pedagógico de cada opção. Animações curtas somente para feedback de interação e desativadas com `prefers-reduced-motion`.

## Responsividade

Em desktop, navegação lateral e coluna ampla de leitura. A 850 px ou menos, a navegação vira drawer; a 360 px a página permanece em uma coluna e o editor fica acessível acima do teclado virtual. O limite de largura de texto da resposta é 72 caracteres. Menus devolvem foco ao botão de abertura.

## Imagens

Nenhuma imagem é necessária no fluxo de estudo atual: a interface precisa priorizar perguntas e respostas textuais. O detalhe gráfico do caderno será construído com CSS. Avaliar ilustrações apenas quando houver uma necessidade pedagógica concreta, como explicar um conceito visual.

Validação automatizada: contraste dos tokens principais, foco por teclado e ausência de rolagem horizontal em cinco telas a 360 e 1440 px. Capturas da evolução estão nos artefatos do teste E2E. Leitor de tela, todos os estados de erro e breakpoints intermediários ainda exigem revisão manual.
