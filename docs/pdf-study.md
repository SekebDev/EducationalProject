# Caderno de PDF

O PDF é uma ferramenta da conversa. Abra um chat em `/conversas`, envie o material pelo painel **Arquivos da conversa** e use **Estudar PDF** no arquivo anexado. O editor abre dentro do chat; o campo de mensagem e o histórico continuam sendo os da conversa. Não há criação automática de uma conversa de apoio nem uma biblioteca de PDF separada. Links antigos de `/estudos` encaminham para as conversas, e links de materiais encaminham para seu chat de origem.

## Usar

1. Entre na conta e abra ou crie uma conversa.
2. Envie um PDF de até 20 MB e 200 páginas em **Arquivos da conversa** e escolha **Estudar PDF** no material.
3. Selecione texto ou uma área e escreva sua dúvida no campo de mensagem do próprio chat. Com o PDF aberto, o tutor usa a página e a seleção junto ao contexto da conversa. Feche o editor para continuar conversando sem uma página ativa.
4. Use destaques, círculos, setas, desenho livre e notas para complementar o caderno. **Mover anotação** permite selecionar, reposicionar e abrir uma nota com duplo clique ou Enter. Notas selecionadas também têm edição abaixo do leitor.
5. **Página de estudo** insere uma página após a original e as explicações já relacionadas. Páginas originais continuam imutáveis. Páginas extras podem ser excluídas e a exclusão pode ser desfeita.
6. Aguarde **Salvo** e use **Exportar PDF**. O arquivo contém o material original, as anotações e as páginas extras na ordem do caderno. Os objetos continuam editáveis no SaaS; o PDF exportado incorpora os desenhos ao conteúdo.

O mascote anime kawaii ensina por etapas. Ao perguntar sobre uma seleção, o tutor sublinha a linha atual, aproxima o mascote e apresenta a explicação junto dele. **Entendi** confirma aquela etapa antes de avançar. Você pode pedir **Explicar de outro jeito** ou **Desenhar**; a pergunta é preparada no chat, mantendo a linha como contexto. Reduzir movimentos muda a animação, sem dispensar a confirmação. A sequência e o progresso ficam salvos com o caderno.

No computador, arraste a divisória entre o chat e o PDF para dar mais espaço a um dos painéis. Com a divisória em foco, use as setas para ajustar ou dê duplo clique para restaurar a largura inicial. O botão no cabeçalho recolhe e reabre o menu da esquerda. Essas preferências ficam salvas neste navegador.

## Rodar e configurar

Use Node 24 e pnpm 10, conforme o README. Execute `pnpm install --frozen-lockfile`, `pnpm db:migrate` e `pnpm dev`. As migrações `010_pdf_study.sql` e `011_pdf_tutor_attempts.sql` são aditivas. A migração `012_pdf_conversation_context.sql` incorpora as explicações antigas ao chat e reorganiza sua sequência por turno, preservando os IDs das mensagens. Execute essa migração com a aplicação parada e recarregue as conversas abertas depois, para renovar os cursores de paginação. No Docker, reconstrua a imagem para incluir os arquivos e dependências novos e execute o serviço de migração.

`AI_PROVIDER=fake` permite testar o editor, o histórico, a exportação e o fluxo de explicação. A interface identifica o **modo de demonstração**; suas respostas não interpretam o conteúdo do professor.

Para o tutor real, configure `AI_PROVIDER=openai`, `OPENAI_API_KEY` e o modelo de chat já usado no projeto. `OPENAI_PDF_TUTOR_MODEL` é opcional e usa `OPENAI_CHAT_MODEL` como alternativa. A chave permanece na API. A integração usa Responses com saída estruturada e streaming, não chamadas do navegador ao provedor. As configurações existentes de orçamento de execução também se aplicam.

## Persistência e referências

- O PDF original não é regravado. `pdf_study` mantém a ordem de páginas e as anotações em um documento JSON validado, com revisão incremental. Cada página tem UUID estável e o índice original fica separado da posição exibida.
- Os desenhos usam pontos na área visível, sem rotação, com origem superior esquerda. O leitor aplica a rotação de exibição; o exportador usa a origem do CropBox e mantém a rotação original.
- Cada alteração tem UUID de operação e hash de conteúdo. Reenvio devolve o mesmo resultado confirmado. Reusar o UUID com outro conteúdo ou salvar a partir de uma revisão antiga retorna conflito.
- Uma fila em IndexedDB guarda operações ainda não confirmadas, separadas por conta e material. Ela é recuperada ao reabrir. **Pendente** não significa salvo no servidor. Em conflito, o aluno pode baixar seu rascunho antes de reabrir a versão salva; não há substituição automática de trabalho de outra aba.
- Desfazer/refazer usa as últimas 30 ações confirmadas, persistidas no servidor. Uma explicação inteira, suas páginas e desenhos são uma ação. O histórico da conversa fica preservado mesmo ao desfazer os desenhos. Uma nova edição após desfazer inicia outro ramo e encerra a possibilidade de refazer o ramo antigo.
- Perguntas usam o texto e a geometria extraídos pelo backend do PDF, o histórico recente da conversa, sua personalidade, método e profundidade, materiais selecionados, seleção e imagem reduzida da página renderizada. O servidor lê esse contexto diretamente; o navegador não fornece o histórico. IDs citados e formas são verificados antes de salvar. O conteúdo do documento é tratado como dados, não como instruções.
- Perguntas e explicações do tutor entram no histórico canônico da conversa. O registro do PDF mantém as referências aos desenhos, sem criar outro chat. A explicação no histórico permite reabrir o documento e a página relacionada.
- O layout conserva espaço nas páginas originais: sublinhados apontam para linhas verificadas. Explicações aparecem junto ao mascote e no histórico do chat; não são copiadas como notas de prosa no PDF. Diagramas usam objetos visuais com rótulos e conexões, em páginas extras relacionadas quando precisam de espaço. Notas manuais continuam disponíveis.
- A explicação e seus desenhos são persistidos em uma transação antes da animação. A exportação recebe uma revisão confirmada e retorna um PDF privado. Exclusão do material impede novos acessos; a purga do material remove também o caderno, as operações e as conversas do tutor por cascade.

## Limites atuais

O editor aceita até 400 páginas no caderno, 1.500 anotações, 2.000 pontos por traço e 4.000 caracteres por nota. Há uma explicação simultânea por conta e até 100 solicitações ao tutor em 24 horas, incluindo tentativas interrompidas. Repetir uma operação já concluída não consome outra chamada ao provedor. O corpo JSON tem limite de 2 MB; imagens de contexto são reduzidas para caber nesse limite.

PDFs sem senha e com dimensões entre 72 e 14.400 pontos são aceitos. Páginas escaneadas podem ser selecionadas por região e consultadas visualmente, mas ainda não há OCR nem seleção textual nesses documentos. Imagens de contexto vêm do leitor; a imagem visual pode perder detalhes pequenos ao ser reduzida. Textos muito extensos em uma única página podem exceder o orçamento de entrada e exigir uma pergunta em uma página mais simples; ainda não há busca global entre páginas deste caderno.

Anotações usam a fonte Noto Sans Latin incorporada, com a mesma fonte no leitor e na exportação. Português e fórmulas escritas com caracteres disponíveis são preservados. Símbolos fora desse conjunto geram um erro claro de exportação; não há renderizador matemático para notas nem garantia para emojis ou todos os alfabetos. Fórmulas já presentes no PDF original são preservadas com suas fontes originais. Voz, colaboração simultânea e anotações PDF nativas editáveis em outros leitores continuam como evoluções posteriores.

## Verificações

Testes relevantes estão em `apps/api/test/pdf-study`, `apps/web/src/features/pdf-study/*.spec.ts` e `tests/e2e/pdf-study.spec.ts`. As suítes de integração requerem `TEST_DATABASE_URL` para um banco isolado. Elas não usam credenciais reais de IA. O E2E cobre upload, renderização, anotações, recuperação de IndexedDB após falha de rede, páginas extras, histórico, demonstração e download com inspeção do PDF.

Documentação das integrações consultada: [PDF.js](https://mozilla.github.io/pdf.js/examples/), [pdf-lib](https://pdf-lib.js.org/docs/api/classes/pdfdocument), [Responses com saída estruturada](https://developers.openai.com/api/docs/guides/structured-outputs) e [streaming](https://developers.openai.com/api/docs/guides/streaming-responses). A leitura do texto usa a versão PDF.js já presente no backend; o frontend usa a mesma versão.
