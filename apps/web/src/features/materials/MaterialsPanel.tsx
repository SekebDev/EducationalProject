'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { api, errorMessage } from '../../lib/api';
import { Button } from '@/components/ui/button';
import {
  Check,
  Download,
  FileText,
  FolderOpen,
  LoaderCircle,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import styles from './MaterialsPanel.module.css';

export type ConversationMaterial = {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  state: 'received' | 'processing' | 'ready' | 'failed';
  error: string | null;
  selected: boolean;
};
type Material = ConversationMaterial;

export function validateMaterial(file: File): string | null {
  if (file.size === 0) {
    return `${file.name}: o arquivo está vazio.`;
  }
  if (file.size > 20_000_000) {
    return `${file.name}: o limite é de 20 MB por arquivo.`;
  }
  if (!/\.(pdf|docx|txt|md|markdown)$/iu.test(file.name)) {
    return `${file.name}: use PDF, DOCX, TXT ou Markdown (.md).`;
  }
  return null;
}

export function useConversationMaterials({
  conversationId,
  conversationVersion,
  onChanged,
}: {
  conversationId: string;
  conversationVersion: number;
  onChanged: () => Promise<void>;
}) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadedConversationId, setLoadedConversationId] = useState<
    string | null
  >(null);
  const busy = useRef(false);
  const initialLoad = useRef<Promise<void> | null>(null);
  const materialCount = useRef(0);
  const uploadKeys = useRef(new WeakMap<File, string>());
  const [uploadStatus, setUploadStatus] = useState('');
  const currentConversation = useRef(conversationId);
  currentConversation.current = conversationId;
  const [failedFiles, setFailedFiles] = useState<
    Array<{ file: File; message: string }>
  >([]);

  const load = useCallback(async () => {
    const page = await api<{ items: Material[] }>(
      `/conversations/${conversationId}/materials`,
    );
    if (currentConversation.current !== conversationId) {
      return;
    }
    materialCount.current = page.items.length;
    setMaterials(page.items);
    setLoadedConversationId(conversationId);
  }, [conversationId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setMaterials([]);
    setError('');
    const pending = load();
    initialLoad.current = pending;
    void pending
      .catch((cause: unknown) => {
        if (mounted) {
          setError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [load]);

  useEffect(() => {
    if (
      !materials.some((material) =>
        ['received', 'processing'].includes(material.state),
      )
    ) {
      return;
    }
    const timer = setInterval(() => void load().catch(() => undefined), 1500);
    return () => clearInterval(timer);
  }, [materials, load]);

  async function uploadFiles(files: File[]) {
    if (busy.current) {
      setError(
        'Aguarde o envio atual terminar para adicionar outros arquivos.',
      );
      return;
    }
    busy.current = true;
    setWorking(true);
    if (loading) {
      setUploadStatus('Preparando envio…');
      try {
        await initialLoad.current;
      } catch (cause) {
        setError(errorMessage(cause));
        setFailedFiles((current) => [
          ...current,
          ...files.map((file) => ({ file, message: errorMessage(cause) })),
        ]);
        setUploadStatus('Não foi possível preparar o envio. Tente novamente.');
        busy.current = false;
        setWorking(false);
        return;
      }
    }
    const accepted: File[] = [];
    const notices: string[] = [];
    for (const file of files) {
      const invalid = validateMaterial(file);
      if (invalid) {
        notices.push(invalid);
      } else if (accepted.length + materialCount.current >= 10) {
        notices.push(`${file.name}: a conversa aceita até 10 materiais.`);
      } else {
        accepted.push(file);
      }
    }
    setError(notices.join(' '));
    if (accepted.length === 0) {
      busy.current = false;
      setWorking(false);
      return;
    }
    setFailedFiles((current) =>
      current.filter((item) => !accepted.includes(item.file)),
    );
    let completed = 0;
    try {
      for (const [index, file] of accepted.entries()) {
        setUploadStatus(
          `Enviando ${index + 1} de ${accepted.length}: ${file.name}`,
        );
        const form = new FormData();
        form.append('file', file);
        const key = uploadKeys.current.get(file) ?? crypto.randomUUID();
        uploadKeys.current.set(file, key);
        try {
          await api(`/conversations/${conversationId}/materials`, {
            method: 'POST',
            body: form,
            idempotent: true,
            idempotencyKey: key,
          });
          completed += 1;
          materialCount.current += 1;
        } catch (cause) {
          setFailedFiles((current) => [
            ...current,
            { file, message: errorMessage(cause) },
          ]);
          continue;
        }
        await load().catch((cause: unknown) => setError(errorMessage(cause)));
      }
    } finally {
      setUploadStatus(
        `${completed} ${completed === 1 ? 'arquivo enviado' : 'arquivos enviados'}.`,
      );
      busy.current = false;
      setWorking(false);
    }
  }

  async function toggle(id: string) {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setWorking(true);
    setError('');
    try {
      const selected = materials
        .filter((material) => material.selected)
        .map((material) => material.id);
      const materialIds = selected.includes(id)
        ? selected.filter((item) => item !== id)
        : [...selected, id];
      await api(`/conversations/${conversationId}/sources`, {
        method: 'PUT',
        body: { materialIds, version: conversationVersion },
      });
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setError(errorMessage(cause));
      await Promise.all([load(), onChanged()]).catch(() => undefined);
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }

  async function remove(material: Material) {
    if (busy.current) {
      return;
    }
    if (
      !window.confirm(
        `Excluir ${material.name}? As novas respostas não poderão usar este material.`,
      )
    ) {
      return;
    }
    busy.current = true;
    setWorking(true);
    setError('');
    try {
      await api<void>(`/materials/${material.id}`, { method: 'DELETE' });
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }

  return {
    materials,
    loading,
    loadedConversationId,
    working,
    error,
    uploadStatus,
    failedFiles,
    uploadFiles,
    toggle,
    remove,
  };
}

function selectionLabel(count: number) {
  if (count === 0) {
    return 'Nenhum selecionado';
  }
  return `${count} ${count === 1 ? 'selecionado' : 'selecionados'}`;
}

export function MaterialsPanel({
  controller,
  onOpenPdf,
}: {
  controller: ReturnType<typeof useConversationMaterials>;
  onOpenPdf?: ((id: string) => void) | undefined;
}) {
  const {
    materials,
    loading,
    working,
    error,
    uploadStatus,
    failedFiles,
    uploadFiles,
    toggle,
    remove,
  } = controller;
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedCount = materials.filter(
    (material) => material.selected && material.state === 'ready',
  ).length;
  const processingCount = materials.filter((material) =>
    ['received', 'processing'].includes(material.state),
  ).length;
  const atCapacity = materials.length >= 10;

  function clearFiles() {
    setFiles([]);
    if (fileInput.current) {
      fileInput.current.value = '';
    }
  }

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = files;
    clearFiles();
    void uploadFiles(selected);
  }

  return (
    <section
      className={`materials-panel ${styles.panel}`}
      aria-labelledby="materials-heading"
    >
      <header className={styles.heading}>
        <h3 id="materials-heading">Arquivos da conversa</h3>
        <span
          className={styles.capacity}
          aria-label="Materiais enviados, limite de dez"
        >
          {loading ? '…' : materials.length}
          <span> / 10</span>
        </span>
      </header>
      <p className={styles.description}>
        Escolha quais arquivos o professor deve consultar nas respostas.
      </p>
      <form
        className={styles.upload}
        onSubmit={(event) => void upload(event)}
        aria-label="Enviar materiais"
      >
        <input
          id="material-file"
          ref={fileInput}
          type="file"
          aria-label="Adicionar material"
          multiple
          className={styles.fileInput}
          tabIndex={-1}
          accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/x-markdown"
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          disabled={loading || working || atCapacity}
        />
        <Button
          type="button"
          variant="outline"
          className={styles.chooseFile}
          disabled={loading || working || atCapacity}
          aria-describedby="material-upload-hint"
          onClick={() => fileInput.current?.click()}
        >
          <Upload size={16} aria-hidden="true" /> Escolher arquivo
        </Button>
        <p id="material-upload-hint" className={styles.uploadHint}>
          PDF, DOCX, TXT ou Markdown (.md)
          <br />
          Até 20 MB por arquivo. Arraste para a conversa.
        </p>
        {files.length > 0 && (
          <div className={styles.pending}>
            <div className={styles.pendingHeading}>
              <strong>
                {files.length}{' '}
                {files.length === 1
                  ? 'arquivo para enviar'
                  : 'arquivos para enviar'}
              </strong>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={styles.clearFiles}
                onClick={clearFiles}
                disabled={working}
                aria-label="Limpar arquivos escolhidos"
              >
                <X size={16} aria-hidden="true" />
              </Button>
            </div>
            <ul className={styles.pendingList} aria-label="Arquivos escolhidos">
              {files.map((file, index) => (
                <li key={index}>
                  <FileText size={16} aria-hidden="true" />
                  <span title={file.name}>{file.name}</span>
                </li>
              ))}
            </ul>
            <Button
              className={styles.uploadButton}
              type="submit"
              disabled={working || loading || atCapacity}
            >
              <Upload size={16} aria-hidden="true" />
              {files.length > 1 ? 'Enviar arquivos' : 'Enviar arquivo'}
            </Button>
          </div>
        )}
      </form>
      {atCapacity && (
        <p className={styles.notice}>
          Você chegou ao limite de 10 materiais. Exclua um para adicionar outro.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {uploadStatus && (
        <p className={styles.notice} role="status" aria-live="polite">
          {uploadStatus}
        </p>
      )}
      {failedFiles.length > 0 && (
        <ul className={styles.failedUploads} aria-label="Arquivos não enviados">
          {failedFiles.map(({ file, message }, index) => (
            <li key={index}>
              <strong>{file.name}</strong>
              <p role="alert">{message}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={working || loading || atCapacity}
                onClick={() => void uploadFiles([file])}
              >
                Tentar enviar novamente
              </Button>
            </li>
          ))}
        </ul>
      )}
      {loading ? (
        <p className={styles.loading} role="status">
          <LoaderCircle
            size={16}
            className={styles.spinner}
            aria-hidden="true"
          />
          Carregando materiais…
        </p>
      ) : materials.length === 0 && !error ? (
        <div className={styles.emptyMaterials}>
          <FolderOpen size={24} strokeWidth={1.5} aria-hidden="true" />
          <strong>Nenhum material enviado</strong>
          <p>
            Adicione suas anotações ou textos de estudo. Você também pode
            conversar sem anexos.
          </p>
        </div>
      ) : (
        <div className={styles.library}>
          <p
            className={styles.selectionSummary}
            role="status"
            aria-live="polite"
          >
            <span>{selectionLabel(selectedCount)}</span>
            {processingCount > 0 && (
              <span>{processingCount} em processamento</span>
            )}
          </p>
          <ul
            className={styles.materialsList}
            aria-label="Materiais disponíveis"
          >
            {materials.map((material) => (
              <li
                className={`${styles.materialItem} ${material.selected && material.state === 'ready' ? styles.selected : ''}`}
                key={material.id}
              >
                <label className={styles.materialChoice}>
                  <input
                    type="checkbox"
                    checked={material.selected}
                    disabled={material.state !== 'ready' || working}
                    aria-label={material.name}
                    aria-describedby={`material-${material.id}-state`}
                    onChange={() => void toggle(material.id)}
                  />
                  <FileText
                    size={19}
                    strokeWidth={1.6}
                    className={styles.fileIcon}
                    aria-hidden="true"
                  />
                  <span className={styles.fileName} title={material.name}>
                    {material.name}
                  </span>
                </label>
                <div className={styles.fileMeta}>
                  <span
                    id={`material-${material.id}-state`}
                    className={`${styles.materialState} ${material.state === 'failed' ? styles.failedState : ''}`}
                  >
                    {material.state === 'ready' ? (
                      <Check size={13} aria-hidden="true" />
                    ) : material.state === 'failed' ? (
                      <TriangleAlert size={13} aria-hidden="true" />
                    ) : (
                      <LoaderCircle
                        size={13}
                        className={styles.spinner}
                        aria-hidden="true"
                      />
                    )}
                    {material.state === 'ready'
                      ? 'Pronto'
                      : material.state === 'failed'
                        ? 'Falhou'
                        : 'Processando'}
                  </span>
                  <span>
                    {material.name.split('.').at(-1)?.toUpperCase()} ·{' '}
                    {material.bytes < 1_000_000
                      ? `${Math.max(1, Math.round(material.bytes / 1_000))} KB`
                      : `${(material.bytes / 1_000_000).toFixed(1)} MB`}
                  </span>
                </div>
                <div className={styles.materialActions}>
                  {material.mime === 'application/pdf' &&
                    ['ready', 'failed'].includes(material.state) && (
                      <button
                        type="button"
                        onClick={() => onOpenPdf?.(material.id)}
                        disabled={!onOpenPdf || working}
                        aria-label={`Estudar ${material.name}`}
                      >
                        Estudar PDF
                      </button>
                    )}
                  {material.state === 'ready' && (
                    <a
                      href={`/api/v1/materials/${material.id}/content`}
                      aria-label={`Baixar ${material.name}`}
                    >
                      <Download size={14} aria-hidden="true" /> Baixar
                    </a>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    className={styles.removeMaterial}
                    disabled={working}
                    onClick={() => void remove(material)}
                  >
                    <Trash2 size={14} aria-hidden="true" /> Excluir
                  </Button>
                </div>
                {material.state === 'failed' && (
                  <p className={styles.fileError}>
                    Não foi possível ler o arquivo:{' '}
                    {material.error ?? 'erro desconhecido'}.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
