# Caderno — conceito da continuação da landing page

Continuação do hero que transforma caos escolar em organização. Aqui, a composição já está organizada: tipografia alinhada, áreas de demonstração claras, espaços constantes e poucos objetos escolares. O papel rasgado permanece em faixas, divisões e no caderno do fechamento.

## Sequência visual

| Seção           | Texto principal                   | Demonstração                                                | Direção visual                                                                                   |
| --------------- | --------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Professor de IA | Uma boa pergunta abre o caminho.  | Dúvida sobre fotossíntese, explicação e estilos disponíveis | Fundo de papel claro; conversa alinhada em um painel legível; clipe no canto                     |
| Materiais       | Tudo o que você trouxe. Bem aqui. | PDF, TXT e DOCX; dois arquivos selecionados                 | Fundo sálvia; lista de arquivos à esquerda e texto à direita; marcadores de seleção em sequência |
| Prática         | Entendeu? Agora tenta.            | Resposta seguida da correção por IA                         | Fundo marfim amarelado; questão e correção alinhadas; lápis como detalhe funcional               |
| Evolução        | Olha o quanto já fez sentido.     | Três temas, barras e sugestão de próximo passo              | Painel amplo com linhas alinhadas; percentuais fictícios identificados como exemplo              |
| Fechamento      | A próxima página é sua.           | Folha de caderno, pergunta inicial e CTA                    | Verde profundo; chamada ampla, botão amarelo e folha em branco organizada                        |

## Movimento

O vídeo simula uma rolagem contínua de 26 segundos. Cada seção tem um tempo de leitura; as passagens verticais duram aproximadamente um segundo. A navegação e o indicador de rolagem permanecem visíveis.

Os movimentos são curtos e têm função específica: a explicação aparece após a dúvida, as seleções dos arquivos se confirmam, a correção segue a resposta e as barras revelam a evolução. Os objetos 3D renderizados acompanham esses exemplos sem recuperar a dispersão do hero.

## Composição e integração futura

- Paleta: papel claro `#F1EEDF`, verde `#193F34`, sálvia `#DFE6D6` e marfim amarelado `#F0ECD8`.
- Títulos com peso visual alto e frases curtas; texto explicativo em linhas mais curtas e regulares.
- Painéis de produto retos, com superfície clara e espaçamento constante.
- Papéis e objetos usam o kit preparado em `public/landing/school-kit`; textos devem continuar em HTML na página.
- No mobile, colocar texto antes das demonstrações e reduzir a quantidade de objetos.
- Em movimento reduzido, mostrar cada demonstração em seu estado final.

As seções da continuação estão integradas à landing. O novo vídeo `6f736ce2-fe54-4c8f-8fdd-98a5254bd2c5.mp4` orienta especificamente o professor de IA: título forte em DM Sans, painel marfim reto e clipe no canto. A demonstração `LandingChatDemo` permite escolher Acolhedora, Objetiva ou Socrática, avançar por três trocas de mensagens e recomeçar. As respostas são roteiros locais, identificados como conversa simulada; cada estilo abre um exemplo novo. A primeira resposta aparece quando o painel entra na área visível, e o modo de movimento reduzido remove a espera.
