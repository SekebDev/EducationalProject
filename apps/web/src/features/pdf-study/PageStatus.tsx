import styles from './study-editor.module.css';

export function PageStatus({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry(): void;
}) {
  if (!loading && !error) {
    return null;
  }
  return (
    <div className={styles.pageStatus} role={error ? 'alert' : 'status'}>
      {error ?? 'Carregando página…'}
      {error && <button onClick={onRetry}>Tentar novamente</button>}
    </div>
  );
}
