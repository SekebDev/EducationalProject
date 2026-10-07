# Landing page do Caderno — do caos escolar à clareza

## 1. Conceito criativo

A página segue o novo vídeo-conceito: um quadro escolar escuro, papéis rasgados sobrepostos, rabiscos e objetos de papelaria flutuantes. O título “Tudo ao / mesmo / tempo” ocupa três faixas rasgadas. Rosa, amarelo e lilás contrastam com o fundo `#192327`; a bagunça aparece na composição antes da explicação do produto. O header faz parte do palco sticky.

A rolagem organiza as mesmas quatro folhas. Cada uma muda de posição e rotação; o papel colorido se dissolve sobre uma versão pautada creme, sálvia, marfim ou mint. No meio do percurso, “Cada coisa no seu lugar” aparece em tipografia serifada. O quadro escuro dá lugar ao papel claro `#F1EEDF`, os objetos repousam nas bordas ou saem da cena e o fechamento mostra “Um caminho / para / estudar”, com CTA. A transformação visual conecta dúvida, materiais, prática e evolução sem criar funcionalidades inexistentes.

## 2. Referências e aprendizados

- [Notion for Education](https://www.notion.com/product/notion-for-education): fala com estudantes a partir dos materiais e tarefas que eles reconhecem. Aprendizado: explicitar o uso antes de detalhar recursos.
- [Readwise Reader](https://readwise.io/read): organiza múltiplas fontes em uma narrativa de leitura. Aprendizado: mostrar a relação entre o material de entrada e a ação que ele permite.
- [Linear](https://linear.app/features): distribui capacidades complexas em demonstrações visuais separadas. Aprendizado: dar uma função específica a cada trecho, com bastante respiro.
- [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/): referência técnica para cenas presas ao viewport e progressão ligada à rolagem. Aprendizado: prender apenas o elemento que ajuda a entender a transformação; preservar leitura e movimento reduzido.

As referências servem para direção e técnica. A composição, a copy e os exemplos da página são originais.

## 3. Estratégia

- **Público:** estudante brasileiro que estuda sozinho, tem dúvidas, arquivos e temas para revisar.
- **Problema:** conteúdo e perguntas dispersos tornam difícil decidir por onde continuar.
- **Promessa:** reunir pergunta, materiais, prática e evolução em um processo mais claro de estudo.
- **Diferencial verificável:** professor de IA com estilos de explicação, uso opcional de arquivos próprios, provas objetivas e discursivas, correções explicadas e evolução por tema.
- **Objeções:** “preciso enviar arquivo para começar?” (não); “a IA vai usar quais materiais?” (somente os arquivos enviados e selecionados); “a correção substitui meu julgamento?” (é apoio formativo de IA); “vou saber o que praticar?” (evolução por tema aponta pontos de atenção).
- **Ação principal:** “Começar meu Caderno” leva a `/cadastro`. Entrada existente fica em `/entrar`.

## 4. Mapa e wireframe textual

| Trecho     | Função                    | Desktop                                                                                      | Mobile                                                |
| ---------- | ------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Hero       | Reconhecimento e ação     | Header no palco sticky, título em três faixas e folhas espalhadas no quadro escuro           | Faixas legíveis e composição de papéis reduzida       |
| Pergunta   | Primeiro passo            | Primeira folha se alinha e revela uma pergunta ao professor de IA                            | Mesma cena presa ao viewport; texto explicativo acima |
| Materiais  | Mostrar arquivos próprios | Segunda folha perde a inclinação e vira área de material selecionado                         | Segunda peça encontra seu lugar na composição         |
| Prática    | Mostrar prova e correção  | Terceira folha se transforma em uma prova ilustrativa                                        | A questão aparece na terceira peça alinhada           |
| Evolução   | Indicar continuidade      | Quarta folha completa a composição pautada sobre o fundo marfim                              | Quatro peças organizadas e legíveis                   |
| Fechamento | Converter                 | “Um caminho / para / estudar” e CTA ao final da transformação; explicações do produto abaixo | Mesma ordem, com objetos decorativos reduzidos        |

## 5. Títulos e copy final

1. **“Tudo ao / mesmo / tempo”** Reconhece a sobrecarga escolar e acompanha as três faixas rasgadas do vídeo-conceito. **Escolhido.**
2. “Das dúvidas soltas ao próximo passo.” Curto e memorável, mas explica menos claramente que se trata de estudo.
3. “Uma pergunta pode colocar seus estudos em movimento.” Funciona para a primeira etapa, mas deixa materiais e prática em segundo plano.

**Hero:** “Tudo ao / mesmo / tempo”. A composição mostra dúvidas, arquivos e conteúdo para revisar. O Caderno reúne professor de IA, materiais próprios, provas e evolução por tema em um caminho de estudo mais claro. A entrada existente permanece em `/entrar`.

**Copy da transformação:** “Cada coisa no seu lugar”. As quatro folhas representam conversa com o professor de IA, seleção de arquivos PDF/DOCX/TXT, prática objetiva e discursiva com correções de IA, e evolução por tema.

**Final da cena:** “Um caminho / para / estudar”. CTA: “Começar meu Caderno”.

**Pergunta:** “Uma boa pergunta abre o caminho.” “Escolha o estilo da explicação e converse sobre a dúvida que está na sua cabeça.” “Você pode começar sem enviar arquivos.” O exemplo permite escolher entre Acolhedora, Objetiva e Socrática.

**Materiais:** “Tudo o que você trouxe. Bem aqui.” “Envie PDF, DOCX ou TXT e selecione o que quer usar como apoio. Assim, você estuda a partir do conteúdo que trouxe, com referências aos arquivos enviados.”

**Prática:** “Entendeu? Agora tenta.” “Crie uma prova com questões objetivas e discursivas. Depois de responder, revise a correção e as explicações geradas por IA para entender onde errou e por quê.”

**Evolução:** “Olha o quanto já fez sentido.” “Acompanhe sua evolução por tema e retome a prática nos pontos que precisam de atenção. Os indicadores exibidos nesta página são apenas ilustrativos.”

**Fechamento:** “A próxima página é sua.” “Traga sua dúvida, estude com seus materiais, pratique e acompanhe o caminho que você constrói.” CTA: “Começar meu Caderno”.

## 6. Plano de movimento

- **Cena contínua:** `ChaosJourney` usa o progresso da rolagem para organizar a composição dentro de um palco com `position: sticky`. Header, título, folhas e objetos pertencem à mesma cena.
- **Paleta do fundo:** o quadro `#192327` se dissolve sobre o fundo de papel `#F1EEDF`. Amarelo, rosa e lilás marcam a abertura; creme, sálvia, marfim, mint e tinta verde profunda marcam a organização.
- **Abertura:** “Tudo ao / mesmo / tempo” aparece em três faixas rasgadas. Folhas e objetos têm inclinações e posições irregulares, com rabiscos decorativos sobre o quadro.
- **Meio:** “Cada coisa no seu lugar”, em serif, acompanha a mudança das folhas. O título da abertura sai e a composição abre espaço para os exemplos de uso.
- **Pergunta, 0,25–0,44:** a primeira folha se alinha e faz crossfade para papel pautado creme, revelando a conversa com o professor de IA.
- **Materiais, 0,40–0,60:** a segunda folha encontra seu lugar e faz crossfade para papel pautado sálvia, com o material selecionado.
- **Prática, 0,55–0,75:** a terceira folha se organiza e faz crossfade para papel pautado marfim, com prova e correção ilustrativas.
- **Evolução, 0,68–0,88:** a quarta folha termina o conjunto e faz crossfade para papel pautado mint, com evolução por tema.
- **Objetos:** lápis, borracha e clipe usam renderizações WebP transparentes; seus deslocamentos acompanham o progresso em camadas separadas. O papel amassado se afasta e sai da composição. Os GLBs estão disponíveis no kit caso a rotação tridimensional se torne necessária.
- **Final:** “Um caminho / para / estudar” e o CTA aparecem sobre a paleta clara. As mesmas quatro folhas completam a transformação.
- **Mobile:** reduz a quantidade e a amplitude dos elementos decorativos, preservando leitura e acesso ao CTA. Com `prefers-reduced-motion`, apresenta diretamente uma composição organizada e estática.

## 7. Inventário visual

Os recursos vêm do kit preparado para o novo vídeo-conceito, em `apps/web/public/landing/school-kit/`. Consulte o [guia de integração](caderno-school-assets.md) e o [manifesto](../apps/web/public/landing/school-kit/manifest.json) para caminhos, dimensões, transparência, proporções e margens de segurança.

| Recurso                                                                          | Função                                      | Formato e dimensões                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `chalkboard` e `warm-paper-background`                                           | Transição do quadro escuro para papel claro | WebP opaco, 1280 × 720; versões mobile 320 × 180                                   |
| `paper-yellow`, `paper-pink`, `paper-lilac` e folhas sobrepostas                 | Bagunça inicial                             | WebP com transparência, 700 × 520; versões mobile 320 × 238                        |
| `paper-ruled-cream`, `paper-ruled-sage`, `paper-ruled-ivory`, `paper-ruled-mint` | Quatro folhas organizadas                   | WebP com transparência, 700 × 520; versões mobile 320 × 238                        |
| `torn-strip-cream`, `torn-strip-yellow`, `torn-strip-sage`                       | Faixas rasgadas dos títulos e marcações     | WebP transparente; proporções próprias no manifesto                                |
| `pencil`, `eraser`, `paperclip`, `crumpled-paper`                                | Papelaria flutuante e profundidade          | Renderizações 3D em WebP transparente, com recorte enxuto                          |
| 11 máscaras de papéis e faixas                                                   | Silhuetas rasgadas e recoloração            | SVG escalável, com contorno e furos                                                |
| `loop-arrow`, `scribble-underline`, `chalk-scribbles`                            | Anotações e rabiscos decorativos            | SVG escalável; máscara CSS ou inserção inline para recoloração                     |
| 4 modelos de objetos                                                             | Opção de movimento tridimensional           | GLB separado, eixo Y para cima, materiais incorporados e nenhuma animação embutida |

O kit contém **17 WebPs principais e 17 versões mobile**, **14 SVGs** e **4 GLBs**. Os WebPs principais somam **878.878 bytes, aproximadamente 858 KiB**. PNGs originais e arquivo Blender permanecem no pacote de origem. Todo texto da página fica em HTML, com pelo menos 12% de margem interna nos papéis. As dimensões dos objetos diferem dos renders originais de 600 × 600 porque a área transparente foi recortada.

## 8. Recursos integrados

`ChaosJourney.tsx` utiliza os fundos, papéis rasgados, faixas e objetos de `/landing/school-kit/`. As quatro folhas fazem crossfade de cores caóticas para versões pautadas reais, enquanto posição e rotação mudam com a rolagem. Os exemplos do professor de IA, dos materiais, da prova e da evolução permanecem em HTML sobre os assets. Imagens e rabiscos decorativos têm texto alternativo vazio e não bloqueiam cliques.

A animação usa os WebPs renderizados do kit. Os GLBs ficam disponíveis como recursos opcionais; não são necessários para reproduzir a coreografia atual. Não há vídeo reproduzido em loop como substituto da composição interativa.

## 9. Implementação

### Escrita integrada aos papéis

- Fonte manuscrita Caveat, hospedada localmente em `/fonts/Caveat-Variable.ttf`, com licença OFL e origem preservadas. Todas as anotações dentro das folhas usam essa família; os títulos principais da página mantêm DM Sans e Fraunces.
- Texto dimensionado pela própria folha com unidades de container; entrelinha acompanha duas pautas. Recuo de 16% à esquerda mantém a escrita após a margem vermelha, com 12% de respiro à direita e 13% nas bordas superior e inferior.
- Rótulos digitais em caixa alta e ícones foram substituídos por títulos manuscritos sublinhados. Perguntas e anotações curtas preservam o aspecto de caderno.
- Todas as sete folhas da composição têm conteúdo. As três secundárias mostram anotações de Biologia, capítulo 03 e prova; as quatro principais ganham lembretes no caos e exemplos de uso na organização.
- A troca do texto acontece com opacidades complementares, separada da troca de textura, evitando que a folha fique sem escrita durante a transformação. Clipe e borracha repousam fora da área escrita.

### Estrutura da página

- Os papéis de materiais, prova, correção e fechamento têm preenchimento liso em marfim ou sálvia clara. A transparência dos assets fornece somente o contorno: manchas, granulação, pautas e margem vermelha não aparecem nessas superfícies. Sombras mais leves e menor inclinação no fechamento deixam a escrita em destaque. A abertura animada mantém seus assets originais.
- As demonstrações abaixo da abertura seguem a linguagem escolar: conversa em painel marfim reto com clipe, arquivos em papel marfim, prova e correção em folhas separadas. A evolução ocupa um quadro escuro com faixas proporcionais; o fechamento usa fundo amarelo e um lembrete manuscrito. As faixas alongadas usam a transparência do WebP para preencher toda a largura.
- O cabeçalho tem entrelinha explícita, espaço vertical para os caracteres e links sem quebra. Em janelas baixas, os títulos respondem à altura disponível e o palco respeita a altura do viewport.
- A seleção de texto está bloqueada em toda a landing, conforme solicitado, incluindo navegação e anotações.
- A abertura distribui as folhas por uma área maior: três papéis secundários pertencem ao palco inteiro, nos limites superior, direito e inferior esquerdo, enquanto as quatro folhas principais começam mais afastadas. As coordenadas finais continuam formando a composição organizada; no mobile, os recortes de canto são menores para preservar título e CTA.

- A rota `/` renderiza a landing page com metadados de busca e compartilhamento.
- O CTA principal leva a `/cadastro`; o link de entrada leva a `/entrar`.
- `ChaosJourney.tsx` e `ChaosJourney.module.css` concentram a cena. `useScroll` mede o percurso e `useTransform` controla opacidade, escala, posição e rotação dos elementos. O header faz parte do palco sticky.
- A sequência segue os três momentos do vídeo: “Tudo ao / mesmo / tempo”, “Cada coisa no seu lugar” e “Um caminho / para / estudar”. Os títulos das extremidades usam faixas rasgadas; o momento central usa tipografia serifada.
- A composição transforma quatro folhas coloridas em papéis pautados creme, sálvia, marfim e mint. Os textos explicam capacidades existentes e os exemplos de conversa, materiais, prova e evolução são ilustrativos.
- `prefers-reduced-motion` oferece estado estático organizado e remove a exigência da sequência longa de rolagem.
- A coreografia foi construída com Motion, já presente no repositório. Os objetos são renderizações WebP transparentes do kit.

## 10. Verificação

O refinamento das superfícies lisas foi inspecionado nas seções de materiais, prática e fechamento em 1440 × 900 e 390 × 844. A escrita ficou legível sobre os novos preenchimentos; Axe não detectou violações nas três seções e não houve overflow horizontal.

O chat interativo foi integrado seguindo o vídeo `6f736ce2-fe54-4c8f-8fdd-98a5254bd2c5.mp4`: título em DM Sans à esquerda, fundo de papel claro e painel reto com clipe à direita. `LandingChatDemo` apresenta três turnos por personalidade, respostas distintas e indicação persistente de conversa simulada. A primeira resposta surge ao entrar na área visível; as seguintes são acionadas por perguntas de exemplo. Trocar o estilo abre um novo exemplo, e recomeçar preserva o estilo escolhido. Não há chamadas de IA ou envio de dados nessa demonstração.

`scripts/check-landing-chat.mjs` confirmou os três estilos, avanço dos três turnos, reinício, troca rápida durante a espera, teclado e ausência de erros no navegador em 1440, 390 e 360 px. A primeira resposta cabe inteira na área de leitura. Axe não detectou violações na seção, nenhum overflow horizontal foi encontrado e o modo de movimento reduzido manteve a interação. Build e ESLint passaram.

Após a redistribuição dos papéis e a revisão das cinco seções seguintes, as capturas de desktop e mobile foram inspecionadas. O roteiro completo passou sem overflow ou violações do Axe, e o build de produção foi concluído. A correção posterior do cabeçalho e das janelas baixas foi conferida em 1853 × 900, 1853 × 650, 1366 × 768 e 390 × 600: títulos e CTAs cabem nas composições inicial e final. Arraste real sobre o texto confirmou que a seleção está bloqueada nas quatro dimensões.

A revisão da escrita foi conferida após a integração da Caveat: todas as sete folhas têm texto, as quatro principais mantêm escrita nas fases inicial e final, e clipe e borracha deixam a área escrita visível no estado organizado. Capturas de desktop e mobile confirmaram o resultado. Build, TypeScript, ESLint e o roteiro de navegador passaram novamente; nenhum overflow ou violação do Axe foi detectado nos estados verificados.

- Inventário do kit: **conferido**. Os 17 arquivos principais e suas versões mobile existem e suas dimensões correspondem ao manifesto. A transparência coincide com a classificação de cada recurso; os quatro GLBs possuem cabeçalhos válidos e nenhuma animação incorporada.
- Integração e coreografia: **confirmadas** no Edge. Quadro escuro inicial e fundo marfim final; as quatro folhas terminam sem rotação, alinhadas em duas linhas. Título inicial e decoração do quadro desaparecem com a rolagem.
- Build de produção Next.js, TypeScript e ESLint dos arquivos alterados: **aprovados** após esta integração.
- Inspeção visual: **concluída** em 1440 × 900 e 390 × 844, nos progressos 0, 0,50 e 0,96. Uma rodada de correções resolveu a quebra do título inicial, a sobreposição no mobile e a posição final do clipe.
- Rolagem horizontal: **ausente** nas cenas verificadas. O palco permanece preso ao topo e os CTAs ficam acessíveis nas composições inicial e final.
- Axe: **nenhuma violação detectada** nos três estados de desktop e mobile, nem na página estática com movimento reduzido em 1440, 390 e 360 px de largura. A verificação automática não equivale a uma avaliação manual completa com leitores de tela.
- Teclado: primeiro foco em “Ir para o conteúdo”; CTA acionado com Enter e chegada a `/cadastro` **confirmados**. Os três CTAs principais apontam para `/cadastro`; o CTA inicial fica inerte quando sai da cena.
- Movimento reduzido: **confirmado** nas três larguras. Mostra diretamente o título final e as folhas organizadas; no mobile elas seguem em uma coluna para preservar leitura e proporção.
- Verificação reproduzível em `scripts/check-landing.mjs`, com asserções de alinhamento das quatro folhas, palco sticky, ausência de overflow, desaparecimento da cena inicial, Axe e navegação. Capturas em `test-results/landing-scroll-*.png` e `test-results/landing-*.png`.
