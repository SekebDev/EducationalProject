'use client';

import { useEffect, useState } from 'react';
import {
  wrapStudyText,
  type StudyAnnotation,
  type StudyPage,
} from '@study/contracts';
import styles from './pdf-workspace.module.css';

export function WorkspaceNoteEditor({
  annotation,
  page,
  disabled,
  onSave,
}: {
  annotation: StudyAnnotation;
  page: StudyPage;
  disabled: boolean;
  onSave(item: StudyAnnotation): void;
}) {
  const [text, setText] = useState(annotation.text);
  useEffect(() => {
    setText(annotation.text);
  }, [annotation.text]);
  const height =
    wrapStudyText(text, annotation.width - 16, annotation.fontSize).length *
      annotation.fontSize *
      1.4 +
    16;
  const fits = annotation.y + height <= page.height;
  return (
    <form
      className={styles.noteEditor}
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && fits && text.trim()) {
          onSave({ ...annotation, text, height });
        }
      }}
    >
      <label htmlFor="edit-pdf-note">Editar nota selecionada</label>
      <textarea
        id="edit-pdf-note"
        value={text}
        maxLength={4000}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
      />
      <button disabled={disabled || !fits || !text.trim()}>Salvar nota</button>
      {!fits && (
        <p role="alert">
          A nota precisa de mais espaço. Crie uma página de estudo.
        </p>
      )}
    </form>
  );
}
