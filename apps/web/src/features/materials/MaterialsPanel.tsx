'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../lib/api';

type Material = {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  state: 'received' | 'processing' | 'ready' | 'failed';
  error: string | null;
  selected: boolean;
};

export function MaterialsPanel({
  conversationId,
  conversationVersion,
  onChanged,
}: {
  conversationId: string;
  conversationVersion: number;
  onChanged: () => Promise<void>;
}) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const page = await api<{ items: Material[] }>(
      `/conversations/${conversationId}/materials`,
    );
    setMaterials(page.items);
  }, [conversationId]);

  useEffect(() => {
    void load().catch((cause: unknown) => setError(errorMessage(cause)));
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

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      return;
    }
    if (
      file.size === 0 ||
      file.size > 20_000_000 ||
      !/\.(pdf|docx|txt)$/iu.test(file.name)
    ) {
      setError('Escolha um PDF, DOCX ou TXT de até 20 MB, com conteúdo.');
      return;
    }
    setWorking(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      await api(`/conversations/${conversationId}/materials`, {
        method: 'POST',
        body: form,
        idempotent: true,
      });
      setFile(null);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setWorking(false);
    }
  }

  async function toggle(id: string) {
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
      setWorking(false);
    }
  }

  async function remove(material: Material) {
    if (
      !window.confirm(
        `Excluir ${material.name}? As novas respostas não poderão usar este material.`,
      )
    ) {
      return;
    }
    setWorking(true);
    setError('');
    try {
      await api<void>(`/materials/${material.id}`, { method: 'DELETE' });
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="materials-panel" aria-labelledby="materials-heading">
      <div className="materials-heading">
        <div>
          <span className="eyebrow">Fontes opcionais</span>
          <h3 id="materials-heading">Seus materiais</h3>
        </div>
        <span className="state-badge">{materials.length}/10</span>
      </div>
      <p className="hint">
        PDF, DOCX ou TXT com texto, até 20 MB cada. Selecione os materiais que o
        professor deve consultar.
      </p>
      <form
        className="materials-upload"
        onSubmit={(event) => void upload(event)}
      >
        <label htmlFor="material-file">Adicionar material</label>
        <input
          id="material-file"
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          disabled={working || materials.length >= 10}
        />
        <button
          className="button secondary small"
          type="submit"
          disabled={!file || working || materials.length >= 10}
        >
          {working ? 'Aguarde…' : 'Enviar arquivo'}
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {materials.length === 0 ? (
        <p className="hint">
          Nenhum material enviado. Você pode conversar sem anexos.
        </p>
      ) : (
        <ul className="materials-list">
          {materials.map((material) => (
            <li key={material.id}>
              <div className="material-row">
                <label className="material-choice">
                  <input
                    type="checkbox"
                    checked={material.selected}
                    disabled={material.state !== 'ready' || working}
                    onChange={() => void toggle(material.id)}
                  />
                  <span>{material.name}</span>
                </label>
                <span
                  className={`state-badge ${material.state === 'ready' ? 'state-ready' : material.state === 'failed' ? 'state-failed' : ''}`}
                >
                  {material.state === 'ready'
                    ? 'Pronto'
                    : material.state === 'failed'
                      ? 'Falhou'
                      : 'Processando'}
                </span>
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
                <button
                  type="button"
                  className="button ghost small"
                  disabled={working}
                  onClick={() => void remove(material)}
                >
                  Excluir
                </button>
              </div>
              {material.state === 'failed' && (
                <p className="hint">
                  Não foi possível ler o arquivo:{' '}
                  {material.error ?? 'erro desconhecido'}.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
