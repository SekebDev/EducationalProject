'use client';

import { X } from 'lucide-react';
import type { Message } from '@study/contracts';
import { Button } from '@/components/ui/button';
import type { useConversationPdf } from './use-conversation-pdf';
import styles from '../../app/conversas/conversation-flow.module.css';

type Pdf = ReturnType<typeof useConversationPdf>;
export function ConversationPdfContext({
  pdf,
  sending,
}: {
  pdf: Pdf;
  sending: boolean;
}) {
  if (!pdf.materialId) {
    return null;
  }
  return (
    <div className={styles.pdfContext}>
      <div>
        <strong>Estudando o PDF nesta conversa</strong>
        <span>
          {pdf.bridge?.pageTitle || 'Carregando página…'}
          {pdf.bridge?.demo ? ' · Demonstração' : ''}
        </span>
        {pdf.bridge?.hasSelection && (
          <span>
            {pdf.bridge.selectionText
              ? `Trecho: ${pdf.bridge.selectionText.slice(0, 140)}`
              : 'Área da página selecionada'}
          </span>
        )}
        {pdf.bridge?.lessonActive && !pdf.bridge.hasSelection && (
          <span>
            Linha em estudo: {pdf.bridge.currentStepText.slice(0, 140)}
          </span>
        )}
      </div>
      {pdf.bridge?.hasSelection && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={pdf.bridge.clearSelection}
        >
          Limpar seleção
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Fechar PDF e voltar à conversa"
        disabled={sending || Boolean(pdf.bridge?.busy)}
        onClick={() => void pdf.close()}
      >
        <X size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}
export function PdfConversationStatus({
  pdf,
  question,
}: {
  pdf: Pdf;
  question: string;
}) {
  return (
    <>
      {question && (
        <article
          className={`${styles.chatMessage} ${styles.chatUser}`}
          aria-label="Você"
        >
          <div className={styles.userBubble}>{question}</div>
        </article>
      )}
      {pdf.bridge?.busy && pdf.materialId && (
        <div className={styles.chatStatus} role="status">
          <p>{pdf.bridge.progress || 'Preparando sua explicação no PDF…'}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void pdf.bridge?.cancel()}
          >
            Interromper explicação
          </Button>
        </div>
      )}
    </>
  );
}
export function ReopenMessagePdf({
  message,
  onOpen,
}: {
  message: Message;
  onOpen(id: string, pageId?: string): void;
}) {
  if (message.role !== 'assistant' || !message.pdfContext) {
    return null;
  }
  const context = message.pdfContext;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => onOpen(context.materialId, context.pageId)}
    >
      Abrir PDF desta explicação
    </Button>
  );
}
