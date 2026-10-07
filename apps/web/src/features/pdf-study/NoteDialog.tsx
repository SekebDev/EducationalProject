'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './study-editor.module.css';

export function NoteDialog({
  initialText = '',
  onSave,
  onClose,
  validate,
}: {
  initialText?: string;
  onSave(text: string): void;
  onClose(): void;
  validate(text: string): string | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(initialText);
  const validation = text.trim() ? validate(text.trim()) : null;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.noteDialog}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="pdf-note-title"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim() && !validation) {
            onSave(text.trim());
          }
        }}
      >
        <h2 id="pdf-note-title">Nota de estudo</h2>
        <label htmlFor="pdf-note-text">Escreva sua anotação</label>
        <textarea
          id="pdf-note-text"
          autoFocus
          value={text}
          maxLength={4000}
          onChange={(event) => setText(event.target.value)}
          rows={7}
          aria-describedby={validation ? 'pdf-note-error' : undefined}
        />
        {validation && (
          <p id="pdf-note-error" role="alert">
            {validation}
          </p>
        )}
        <div className={styles.noteActions}>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={!text.trim() || !!validation}>
            Salvar nota
          </button>
        </div>
      </form>
    </dialog>
  );
}
