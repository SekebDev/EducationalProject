import type { StudyChange, StudyQuestion } from '@study/contracts';

export type StudyDraft = { queue: StudyChange[]; tutor: StudyQuestion | null };
let database: Promise<IDBDatabase> | null = null;
function openDrafts() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('caderno-pdf-studies', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = null;
      reject(
        new Error(
          'Não foi possível abrir o salvamento local. Verifique as permissões do navegador.',
        ),
      );
    };
  });
  return database;
}
export async function readStudyDraft(key: string): Promise<StudyDraft> {
  const db = await openDrafts();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction('drafts', 'readonly')
      .objectStore('drafts')
      .get(key);
    request.onsuccess = () =>
      resolve(
        (request.result as StudyDraft | undefined) ?? {
          queue: [],
          tutor: null,
        },
      );
    request.onerror = () =>
      reject(new Error('Não foi possível recuperar o rascunho local.'));
  });
}
export async function writeStudyDraft(
  key: string,
  value: StudyDraft,
): Promise<void> {
  const db = await openDrafts();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        new Error('Não foi possível preservar o rascunho neste navegador.'),
      );
    tx.onabort = () =>
      reject(new Error('O salvamento local foi interrompido.'));
  });
}
