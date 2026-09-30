'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { motion } from 'motion/react';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { api, errorMessage } from '../../lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Upload } from 'lucide-react';
import styles from '../../app/conversas/conversation-flow.module.css';

type Material = {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  state: 'received' | 'processing' | 'ready' | 'failed';
  error: string | null;
  selected: boolean;
};

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
  const busy = useRef(false);
  const initialLoad = useRef<Promise<void> | null>(null);
  const materialCount = useRef(0);
  const uploadKeys = useRef(new WeakMap<File, string>());
  const [uploadStatus, setUploadStatus] = useState('');
  const [failedFiles, setFailedFiles] = useState<
    Array<{ file: File; message: string }>
  >([]);

  const load = useCallback(async () => {
    const page = await api<{ items: Material[] }>(
      `/conversations/${conversationId}/materials`,
    );
    materialCount.current = page.items.length;
    setMaterials(page.items);
  }, [conversationId]);

  useEffect(() => {
    const pending = load();
    initialLoad.current = pending;
    void pending
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
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
    working,
    error,
    uploadStatus,
    failedFiles,
    uploadFiles,
    toggle,
    remove,
  };
}

export function MaterialsPanel({
  controller,
}: {
  controller: ReturnType<typeof useConversationMaterials>;
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
  const reducedMotion = useReducedMotion();

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = files;
    setFiles([]);
    if (fileInput.current) {
      fileInput.current.value = '';
    }
    void uploadFiles(selected);
  }

  return (
    <motion.section
      className={`materials-panel ${styles.materialsPanel}`}
      aria-labelledby="materials-heading"
      initial={reducedMotion ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className={`materials-heading ${styles.materialsHeading}`}>
        <div>
          <h3 id="materials-heading">Arquivos da conversa</h3>
        </div>
        <Badge variant="secondary" className={styles.materialCount}>
          {loading ? '…' : materials.length} / 10
        </Badge>
      </div>
      <p className="hint">
        Envie arquivos PDF, DOCX, TXT ou Markdown (.md), de até 20 MB cada. Você
        também pode arrastá-los para a conversa. Escolha quais o professor deve
        consultar.
      </p>
      <form
        className={`materials-upload ${styles.materialsUpload}`}
        onSubmit={(event) => void upload(event)}
      >
        <label htmlFor="material-file">Adicionar material</label>
        <input
          id="material-file"
          ref={fileInput}
          type="file"
          multiple
          className={styles.fileInput}
          tabIndex={-1}
          accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/x-markdown"
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          disabled={loading || working || materials.length >= 10}
        />
        <Button
          type="button"
          variant="outline"
          className={styles.chooseFile}
          disabled={loading || working || materials.length >= 10}
          onClick={() => fileInput.current?.click()}
        >
          <Upload size={16} aria-hidden="true" /> Escolher arquivo
        </Button>
        {files.map((file, index) => (
          <span className={styles.selectedFile} title={file.name} key={index}>
            <FileText size={14} aria-hidden="true" />
            <span>{file.name}</span>
          </span>
        ))}
        <Button
          variant="outline"
          className={styles.uploadButton}
          type="submit"
          disabled={files.length === 0 || working || materials.length >= 10}
        >
          {working
            ? 'Aguarde…'
            : files.length > 1
              ? 'Enviar arquivos'
              : 'Enviar arquivo'}
        </Button>
      </form>
      {materials.length >= 10 && (
        <p className="hint">
          Você chegou ao limite de 10 materiais. Exclua um para adicionar outro.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {uploadStatus && (
        <p className="hint" role="status" aria-live="polite">
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
                disabled={working || loading || materials.length >= 10}
                onClick={() => void uploadFiles([file])}
              >
                Tentar enviar novamente
              </Button>
            </li>
          ))}
        </ul>
      )}
      {loading ? (
        <p className="hint" role="status">
          Carregando materiais…
        </p>
      ) : materials.length === 0 && !error ? (
        <p className={styles.emptyMaterials}>
          Nenhum material enviado. Você pode conversar sem anexos.
        </p>
      ) : (
        <ul className={`materials-list ${styles.materialsList}`}>
          {materials.map((material, index) => (
            <motion.li
              className={styles.materialItem}
              key={material.id}
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(index, 5) * 0.04 }}
            >
              <div className={`material-row ${styles.materialRow}`}>
                <label className="material-choice">
                  <input
                    type="checkbox"
                    checked={material.selected}
                    disabled={material.state !== 'ready' || working}
                    onChange={() => void toggle(material.id)}
                  />
                  <span>{material.name}</span>
                </label>
                <Badge
                  variant={
                    material.state === 'failed' ? 'destructive' : 'secondary'
                  }
                  className={styles.materialBadge}
                >
                  {material.state === 'ready'
                    ? 'Pronto'
                    : material.state === 'failed'
                      ? 'Falhou'
                      : 'Processando'}
                </Badge>
              </div>
              <div className="material-actions">
                <span className="hint">
                  {(material.bytes / 1_000_000).toFixed(2)} MB
                </span>
                {material.state === 'ready' && (
                  <a href={`/api/v1/materials/${material.id}/content`}>
                    Baixar
                  </a>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className={styles.removeMaterial}
                  disabled={working}
                  onClick={() => void remove(material)}
                >
                  Excluir
                </Button>
              </div>
              {material.state === 'failed' && (
                <p className="hint">
                  Não foi possível ler o arquivo:{' '}
                  {material.error ?? 'erro desconhecido'}.
                </p>
              )}
            </motion.li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
