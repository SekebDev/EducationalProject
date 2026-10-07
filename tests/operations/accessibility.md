# Aceite manual com leitor de tela — FR-019/V17

Use Narrador no Windows (Ctrl+Win+Enter) ou NVDA, Edge e uma conta sintética no ambiente fake. Registre data, versões de leitor/navegador, viewport e resultado por ação em `test-results/accessibility/manual-review.md`. Ainda não há revisão humana realizada nesta execução.

1. Entre/cadastre por Tab, Shift+Tab e Enter. Confira nomes de campos, erros e ordem de leitura.
2. Crie conversa, escolha professor, envie pergunta sem arquivo e reabra. Confira identificação como IA, aviso de processamento, resposta e falha/repetição; a pergunta não deve duplicar.
3. Envie material sintético, acompanhe recebido/processando/pronto e selecione/desmarque fonte. Confira nome, estado e motivo de falha; abra a referência e confirme a localização.
4. Configure 10 questões, 5 de cada tipo. Use setas/espaço nas alternativas: selecionar não revela resposta. Confirme por Enter e confira leitura das quatro justificativas, bloqueio da resposta e status de salvamento.
5. Responda discursiva; confira distinção entre salvo e corrigido. Entregue com questões em branco e confira contagem/aviso antes de confirmar. Leia resultado completo e provisório, abra contestação e histórico.
6. Leia evolução vazia/com dados, filtre tema/período/nível, abra tabela equivalente ao gráfico e inicie prática. Confira tema preenchido e nova tentativa separada.
7. Em 360 px, abra/feche menu e materiais: foco contido no diálogo, Escape fecha e retorna foco ao disparador. Repita transições em 768/1024/1440 px. Não deve haver ação cortada nem conteúdo focado oculto.

Para cada item registre **passou/falhou**, anúncio ouvido, ação, evidência e defeito quando houver. `axe` e foco automatizados não comprovam anúncios percebidos por uma pessoa. Falha mantém T056 aberta; correção de comportamento exige regressão automatizada quando viável.
