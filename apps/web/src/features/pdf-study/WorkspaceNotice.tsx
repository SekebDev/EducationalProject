import type { PdfWorkspaceModel } from './use-pdf-workspace';
import styles from './pdf-workspace.module.css';

export function WorkspaceNotice({ model }: { model: PdfWorkspaceModel }) {
  const { project, notice, animation } = model;
  if (!project.error && !notice && !project.retryQuestion) {
    return null;
  }
  function reload() {
    if (
      window.confirm(
        'Reabrir a versão do servidor e descartar este rascunho local? Baixe o rascunho antes se quiser preservá-lo.',
      )
    ) {
      animation.cancelMotion();
      void project.reload();
    }
  }
  return (
    <div className={styles.notice} role="alert">
      <p>
        {notice ||
          project.error ||
          'Você tem uma pergunta aguardando confirmação.'}
      </p>
      <div>
        {project.pending && !project.conflict && (
          <button disabled={project.busy} onClick={() => void project.flush()}>
            Tentar salvar
          </button>
        )}
        {project.conflict && (
          <>
            <button onClick={project.downloadDraft}>Baixar rascunho</button>
            <button disabled={project.busy} onClick={reload}>
              Reabrir versão salva
            </button>
          </>
        )}
        {project.retryQuestion && (
          <>
            <button
              disabled={project.busy}
              onClick={() => {
                if (project.retryQuestion) {
                  void project.ask(project.retryQuestion);
                }
              }}
            >
              Recuperar explicação
            </button>
            <button
              disabled={project.busy}
              onClick={() => void project.cancel()}
            >
              Cancelar pergunta pendente
            </button>
          </>
        )}
      </div>
    </div>
  );
}
