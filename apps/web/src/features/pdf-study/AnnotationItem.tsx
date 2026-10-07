import type { StudyAnnotation } from '@study/contracts';
import type { PdfTool } from './PdfCanvas';
import { StudyAnnotationShape } from './StudyAnnotationShape';

export function AnnotationItem({
  annotation,
  tool,
  selected,
  onSelect,
  onEdit,
}: {
  annotation: StudyAnnotation;
  tool: PdfTool;
  selected: boolean;
  onSelect(id: string): void;
  onEdit(annotation: StudyAnnotation): void;
}) {
  function edit() {
    if (annotation.kind === 'note') {
      onEdit(annotation);
    }
  }
  return (
    <g
      data-annotation-id={annotation.id}
      role="button"
      tabIndex={0}
      aria-label={`${annotation.kind === 'note' ? 'Nota: ' + annotation.text.slice(0, 80) : 'Anotação ' + annotation.kind} (${annotation.author === 'tutor' ? 'tutor' : 'aluno'})`}
      style={{
        pointerEvents: tool === 'select' || tool === 'move' ? 'auto' : 'none',
        cursor: tool === 'move' ? 'move' : 'pointer',
      }}
      onFocus={() => onSelect(annotation.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          edit();
        }
      }}
      onDoubleClick={edit}
    >
      <StudyAnnotationShape annotation={annotation} selected={selected} />
    </g>
  );
}
