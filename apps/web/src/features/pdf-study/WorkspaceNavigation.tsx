import { BookOpen, ChevronLeft, ChevronRight, PanelLeft } from 'lucide-react';
import type { ReadyWorkspaceModel } from './use-pdf-workspace';
import styles from './pdf-workspace.module.css';

export function WorkspaceNavigation({ model }: { model: ReadyWorkspaceModel }) {
  const { showPages, setShowPages, visibleState: state, index, jump } = model;
  return (
    <div className={styles.pageNav}>
      <button
        onClick={() => setShowPages((value) => !value)}
        aria-expanded={showPages}
      >
        <PanelLeft size={16} aria-hidden="true" /> Páginas
      </button>
      <div>
        <button
          aria-label="Página anterior"
          disabled={index === 0}
          onClick={() => jump(state.pages[index - 1]!.id)}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span>
          {index + 1} / {state.pages.length}
        </span>
        <button
          aria-label="Próxima página"
          disabled={index === state.pages.length - 1}
          onClick={() => jump(state.pages[index + 1]!.id)}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function WorkspacePages({ model }: { model: ReadyWorkspaceModel }) {
  return (
    <nav className={styles.pages} aria-label="Páginas do caderno">
      {model.visibleState.pages.map((item, position) => (
        <button
          key={item.id}
          aria-current={item.id === model.page.id ? 'page' : undefined}
          onClick={() => model.jump(item.id)}
        >
          <span>{position + 1}</span>
          <div>
            <strong>
              {item.kind === 'original' ? item.title : 'Página de estudo'}
            </strong>
            <small>
              {item.kind === 'tutor' ? item.title : 'Material do professor'}
            </small>
          </div>
          {item.kind === 'tutor' && <BookOpen size={14} aria-hidden="true" />}
        </button>
      ))}
    </nav>
  );
}
