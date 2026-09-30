# Contrato de experiência e proposta visual

## Contexto e direção

Estudante individual em português, alternando leitura, perguntas e prática. Modo Operate; o sucesso é começar o chat sem upload, concluir uma prova e escolher o próximo estudo a partir de evidências. A spec é a autoridade de produto; não há código, screenshot, PRODUCT.md ou DESIGN.md prévios.

Proposta para revisão antes da implementação visual: um ambiente de estudo claro, com hierarquia de caderno e leitura contínua. Superfície `#F7F7F2`, folha `#FFFFFF`, tinta `#202A27`, texto secundário `#53615A`, ação/seleção `#1E5B49`, erro `#A52D35`, atenção `#775A17`, borda `#D5DDD6`. Cores são tokens semânticos, não hex espalhado em componentes. Validar contraste real de cada combinação; não declarar aprovado sem medição.

Source Sans 3 auto-hospedada com licença incluída; fallback system sans. Corpo 16 px/1.6, controles 14–16 px, títulos 24/28/32 px em escala fixa rem. Leitura de 65–75 caracteres por linha; espaçamento 4/8/12/16/24/32/48 px, raios 6/10 px, divisores leves; sombra reservada a sobreposição. Lucide consistente com rótulos nas ações relevantes. Números tabulares no resultado. Sem gradientes decorativos, vidro, estrelas mágicas ou grades de cartões repetidos.

Impeccable orienta clareza, estados e crítica; Taste frontend-ui-engineering orienta componentes, responsividade e acessibilidade. Esta proposta documenta uma direção concreta, não uma identidade já aprovada ou mockup implementado. Na etapa visual, transformar em tokens e registrar direção escolhida em DESIGN.md e contexto em PRODUCT.md, usando o fluxo aplicável das skills.

## Superfícies e ações

| Rota frontend | Hierarquia e ação principal | Estados essenciais |
|---|---|---|
| /entrar, /cadastro, /recuperar-senha | formulário curto, rótulos persistentes, feedback junto ao campo | enviando, inválido, indisponível, sessão expirada |
| /conversas, /conversas/:id | histórico lateral, professor/estilo no topo, conversa central, editor ao fim; enviar pergunta | vazio orientado, gerando, resposta IA, falha/repetir, salvo |
| painel Materiais da conversa | lista com arquivo, formato/tamanho, estado, seleção e exclusão | recebido, processando, pronto, falhou, limite atingido |
| /provas/nova | conversa de origem primeiro, tema/nível depois, total/tipos e fontes opcionais; gerar | conversa vazia/indisponível, padrão 10/5/5, soma inválida, cobertura insuficiente, gerando |
| /tentativas/:id | número da questão, enunciado, resposta e confirmar; navegação de 10–30 itens | rascunho/salvando/salvo/falhou, confirmado, corrigindo, feedback |
| /tentativas/:id/resultado | situação da avaliação, nota quando válida, temas com evidências, praticar | completo, provisório, contestado, sem base válida |
| /evolucao | próxima ação e temas, série por nível, filtros, tabela textual | vazio, insuficiente, dados completos, recomendações indisponíveis |

Desktop 1440: navegação compacta ~240 px, área de leitura flexível e painel de fontes opcional ~300 px. Não forçar três colunas se a leitura ficar estreita. A partir de 360 px, coluna única, navegação/material em drawer acessível e editor que respeita teclado virtual; sem rolagem horizontal da página. Menu retorna foco ao disparador. Conteúdo longo quebra palavras/URLs; código/tabelas têm rolagem interna identificada, sem cortar ações.

## Interações normativas

- Escolha de personalidade tem descrições pedagógicas claras e opção explícita; não bloquear chat por falta de material. Exibir “Professor de IA” e “Prática formativa”.
- Material em processamento/falha não pode ser selecionado; avisar formatos e limites antes do upload. Fonte abre trecho/página autorizada, nome/localizador legíveis; excluída vira “Fonte indisponível”, sem link ativo.
- Selecionar alternativa não revela resposta. Botão “Confirmar resposta” é separado e bloqueia ao confirmar. Servidor é a autoridade; não mostrar acerto otimista. Em discursiva, distinguir “Resposta salva” de “Correção em andamento”.
- Rascunho salva após pausa curta e ao sair do campo; indicar quando não foi salvo. Mudança de página aguarda envio ou informa estado; recarga restaura somente confirmado pelo servidor. Não guardar textos privados permanentemente em localStorage. Concorrência de abas exige recuperar versão atual antes de sobrescrever.
- “Entregar prova” informa quantidade sem confirmação, incluindo rascunhos, e pede confirmar zeros. Botão em processamento não substitui idempotência no backend. Retomar tentativa mantém questões já confirmadas bloqueadas.
- Feedback objetiva apresenta todas as alternativas com justificativas; discursiva apresenta pontos por critério, lacunas e referência. Contestação exige motivo e deixa visível a exclusão dos indicadores; histórico de versões acessível.
- Resultados com pending exibem nota definitiva indisponível, sem trocar por zero. Todas contestadas: “Não há questões válidas para calcular a nota”. Tema com <3 questões: “Dados insuficientes”, com contagem.
- Gráfico sempre tem datas, unidades, volume, legenda e tabela equivalente. Níveis separados; filtro por tema/período refletido na URL. “Praticar este tema” abre configuração preenchida com 10 questões, editável, preservando origem.
- Exclusões usam confirmação com consequência específica: conversa remove materiais e preserva provas; tentativa sai do painel. Após excluir, mover foco para local estável e anunciar conclusão.

## Componentes e acessibilidade

Botão, campo, radio group, seletor de personalidade, lista de fontes, mensagem com referências, status de salvamento, navegação de questões, bloco de feedback, tema com evidência e gráfico+tabela. Separar busca de dados da apresentação; sem store global até necessidade demonstrada. Cada interação cobre default/hover/focus/active/disabled/loading/error.

HTML semântico; labels visíveis; ordem de headings; Tab/Shift+Tab/Enter/Espaço funcionais; grupos de alternativas com fieldset/legend. Foco visível com contraste verificado, alvos pelo menos 44 px onde possível; status com aria-live polite, sem anunciar cada token. Alertas críticos claros, não dependentes de cor. Drawer/modal mantém foco contido e devolve ao disparador; não esconder conteúdo focado.

Transições de estado de 150–200 ms, sem introduções ornamentais. Respeitar prefers-reduced-motion; conteúdo nunca depende de animação para aparecer. Skeleton com aria-busy ao carregar conteúdo, progresso por fase e erro com próximo passo concreto.

## Prova de aceite

Inspecionar chat, materiais, prova e resultados em 360/1440 px, mais 768/1024 px para transições; incluir texto longo, erro, vazio e pending. Fazer uma rodada agrupada de capturas, corrigir achados em lote e confirmar em segunda rodada. Guardar evidências por rota/estado/viewport/commit. Testar teclado, leitor de tela básico, contraste e axe. Screenshots devem conter dados de fixture explicitamente sintéticos; produção nunca mostra métricas fictícias. SC-001 e SC-007 exigem dez estudantes, não são substituídos por teste automatizado.
