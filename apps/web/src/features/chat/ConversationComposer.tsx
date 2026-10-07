'use client';

import type { FormEvent, RefObject } from 'react';
import type {
  Conversation,
  EducationalSkill,
  ResponseDepth,
} from '@study/contracts';
import { ArrowUp, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StudySkillControls } from './StudySkillControls';
import type { useConversationPdf } from './use-conversation-pdf';
import { ConversationPdfContext } from './ConversationPdfContext';
import styles from '../../app/conversas/conversation-flow.module.css';

type Props = {
  conversation: Conversation;
  content: string;
  setContent(value: string): void;
  input: RefObject<HTMLTextAreaElement | null>;
  compact: boolean;
  sending: boolean;
  active: boolean;
  updating: boolean;
  error: string;
  copied: boolean;
  pdf: ReturnType<typeof useConversationPdf>;
  onSend(event: FormEvent<HTMLFormElement>): Promise<void>;
  onPreferences(value: {
    skill?: EducationalSkill;
    responseDepth?: ResponseDepth;
  }): void;
  onOpenFiles(opener: HTMLElement): void;
};
function hint(content: string, active: boolean, compact: boolean) {
  if (active) {
    return 'O professor está respondendo…';
  }
  if (content.length > 10000) {
    return `${content.length.toLocaleString('pt-BR')} / 12.000`;
  }
  return compact ? '' : 'Enter envia · Shift + Enter quebra a linha';
}
export function ConversationComposer(props: Props) {
  const pdfBlocked = Boolean(
    props.pdf.materialId &&
      (!props.pdf.bridge?.ready || props.pdf.bridge.blocked),
  );
  const disabled =
    props.sending ||
    props.active ||
    props.updating ||
    !props.content.trim() ||
    pdfBlocked;
  return (
    <div className={styles.chatComposerWrap}>
      <ConversationPdfContext pdf={props.pdf} sending={props.sending} />
      <StudySkillControls
        skill={props.conversation.skill}
        responseDepth={props.conversation.responseDepth}
        disabled={props.updating || props.active || props.sending}
        onChange={props.onPreferences}
      />
      <form
        className={styles.chatComposer}
        onSubmit={(event) => void props.onSend(event)}
      >
        <label htmlFor="question" className="sr-only">
          Sua pergunta
        </label>
        <textarea
          ref={props.input}
          id="question"
          placeholder={
            props.pdf.materialId
              ? 'Pergunte sobre a página ou o trecho selecionado'
              : 'Pergunte ao professor'
          }
          value={props.content}
          maxLength={props.pdf.materialId ? 4000 : 12000}
          disabled={props.sending}
          onChange={(event) => props.setContent(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              !props.compact
            ) {
              event.preventDefault();
              if (!disabled) {
                event.currentTarget.form?.requestSubmit();
              }
            }
          }}
          required
          rows={1}
        />
        <div className={styles.chatComposerFooter}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Anexar arquivos"
            onClick={(event) => props.onOpenFiles(event.currentTarget)}
          >
            <Paperclip size={20} aria-hidden="true" />
          </Button>
          <span className={styles.composerHint}>
            {hint(props.content, props.active, props.compact)}
          </span>
          <Button
            className={styles.chatSend}
            type="submit"
            size="icon"
            aria-label={props.sending ? 'Enviando pergunta' : 'Enviar pergunta'}
            disabled={disabled}
          >
            <ArrowUp size={21} aria-hidden="true" />
          </Button>
        </div>
      </form>
      {props.error && (
        <p className={`form-error ${styles.chatError}`} role="alert">
          {props.error}
        </p>
      )}
      <p className={styles.aiNote}>
        O professor usa IA. Confira as respostas e as fontes.
      </p>
      <span className="sr-only" role="status">
        {props.copied ? 'Resposta copiada.' : ''}
        {props.updating ? 'Atualizando o professor…' : ''}
      </span>
    </div>
  );
}
