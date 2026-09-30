# Revisão do frontend

Data: 30/09/2026. Escopo: acesso à conta, navegação, conversas, arquivos, provas, tentativas, resultados e evolução. O trabalho aplica Impeccable, Taste e Humanização de Texto, com frentes paralelas de implementação e revisão.

## Implementação visual

A interface foi refeita com papel claro, verde profundo, detalhes em sálvia e damasco, fontes locais DM Sans Variable e Fraunces Variable. A composição adapta formulários, navegação, mensagens e resultados ao celular.

Os MCPs de shadcn e Magic UI responderam e foram usados para consultar componentes e instruções oficiais. O projeto tem `components.json`, Tailwind e componentes reais dos registros: shadcn Button, Card, Badge, Progress, Sheet e DropdownMenu; Magic UI BlurFade e NumberTicker. Motion trata entradas, seleção, abertura de painéis e mudanças de estado. A preferência por movimento reduzido apresenta os valores finais e remove efeitos decorativos.

O chat segue a estrutura solicitada do ChatGPT: perguntas à direita, respostas com formatação de parágrafos, listas, código e tabelas, área de escrita na parte inferior e menu da personalidade do professor no canto superior esquerdo. Arquivos enviados ficam à direita em telas largas e em um painel acessível no celular. Arrastar arquivos sobre a conversa abre uma área de envio; soltar adiciona vários arquivos em sequência, com validação de formato, tamanho e quantidade. Falhas mantêm o arquivo para nova tentativa, reutilizando a chave de upload. Fontes continuam ligadas às respectivas respostas. A escrita pode continuar enquanto o professor responde. Código tem identificação de linguagem, destaque e botão de copiar. Mermaid alterna diagrama/código e preserva texto legível no celular com rolagem interna acessível. HTML bruto e URLs perigosas não são executados.

A evolução organiza resultados reais, comparação por data e nível, filtros, temas e próximas práticas. A tabela equivalente ao gráfico e os links para respostas específicas preservam o acesso às evidências.

## Correções funcionais e de acessibilidade

- Histórico de conversas com paginação completa e atualização incremental durante a resposta.
- Fontes abertas junto da citação, com foco ao abrir e retorno ao botão ao fechar ou usar Escape.
- Menu móvel com contenção de foco, bloqueio da rolagem e fechamento por clique externo ou Escape.
- Progresso e índice de questões na tentativa, estado de salvamento e confirmação acessíveis.
- Erros de carregamento da tentativa e do resultado com recuperação, sem espera permanente.
- Filtros de evolução sem exibir dados anteriores durante uma nova consulta.
- Cores consistentes por nível e tabela de dados acessível.
- Contraste corrigido em botões que são links e nos rótulos da navegação lateral.
- Títulos longos truncados na navegação sem transbordamento.
- Números animados com valor final estável para leitores de tela.
- Indicador de desenvolvimento desativado para não cobrir o conteúdo do preview.

## Textos

A revisão com Humanização de Texto tornou instruções, estados e erros mais diretos em português, preservando regras, limites, ações e condições. Inclui acesso à conta, criação de conversas, provas, resultados, chat, arquivos e evolução.

## Verificação

TypeScript, ESLint, Prettier e compilação de produção passaram. Os doze cenários E2E passaram na rodada completa final, incluindo quatro regressões adicionais de arrastar arquivos, rejeição e nova tentativa de envio. A auditoria usa axe WCAG A/AA, foco por teclado e ausência de rolagem horizontal em 360, 768, 1024 e 1440 px; tentativa e resultado também foram conferidos em 360/1440 px. O backend passou 127 testes em 34 arquivos, com banco isolado e IA simulada.

O motor automático do Impeccable não pôde ser baixado neste ambiente. A revisão manual, a leitura de código e a inspeção das telas foram usadas; não há resultado do detector automático. Os ensaios externos de staging, carga e avaliação humana definidos na especificação continuam separados desta revisão visual.
