'use client';

import { X } from 'lucide-react';
import { PdfToolbar } from './PdfToolbar';
import { WorkspaceNotice } from './WorkspaceNotice';
import { WorkspaceNavigation, WorkspacePages } from './WorkspaceNavigation';
import { WorkspaceReader } from './WorkspaceReader';
import {
  usePdfWorkspace,
  type PdfWorkspaceModel,
  type ReadyWorkspaceModel,
} from './use-pdf-workspace';
import {
  PdfWorkspaceBridgeEmitter,
  type PdfWorkspaceBridge,
} from './PdfWorkspaceBridge';
import styles from './pdf-workspace.module.css';

type PdfWorkspaceProps = {
  materialId: string;
  onClose(): void;
  onBridge(bridge: PdfWorkspaceBridge | null): void;
  onCompleted(): void | Promise<void>;
  onRequestQuestion?(question: string): void;
};

function ReadyWorkspace({
  model,
  onClose,
}: {
  model: ReadyWorkspaceModel;
  onClose(): void;
}) {
  return (
    <section
      className={`${styles.workspace} ${styles.embedded}`}
      aria-label="Área de estudo do PDF"
    >
      <header className={styles.documentHeader}>
        <div>
          <h2>{model.study.title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={model.project.busy}
          aria-label="Fechar PDF"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>
      <PdfToolbar {...model.toolbar} />
      <WorkspaceNotice model={model} />
      <WorkspaceNavigation model={model} />
      <div className={styles.studyGrid}>
        {model.showPages && <WorkspacePages model={model} />}
        <WorkspaceReader model={model} />
      </div>
    </section>
  );
}
function WorkspaceContent({
  model,
  onClose,
}: {
  model: PdfWorkspaceModel;
  onClose(): void;
}) {
  const { study, state, visibleState, page, project } = model;
  if (!study || !state || !visibleState || !page) {
    return (
      <div className={styles.opening} role={project.error ? 'alert' : 'status'}>
        {project.error || 'Abrindo seu caderno…'}
        <button type="button" onClick={onClose}>
          Fechar PDF
        </button>
      </div>
    );
  }
  return (
    <ReadyWorkspace
      model={{ ...model, study, state, visibleState, page }}
      onClose={onClose}
    />
  );
}
export function PdfWorkspace({
  materialId,
  onClose,
  onBridge,
  onCompleted,
  onRequestQuestion,
}: PdfWorkspaceProps) {
  const model = usePdfWorkspace(materialId, onCompleted, onRequestQuestion);
  return (
    <>
      <PdfWorkspaceBridgeEmitter model={model} onBridge={onBridge} />
      <WorkspaceContent model={model} onClose={onClose} />
    </>
  );
}
