'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, errorMessage, RequestError } from '../../../lib/api';

// Preserve bookmarks while keeping the conversation as the study entry point.
export default function PdfStudyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api<{ conversationId: string }>(`/materials/${id}`)
      .then((material) => {
        if (active) {
          router.replace(`/conversas/${material.conversationId}?pdf=${id}`);
        }
      })
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }
        if (cause instanceof RequestError && cause.status === 401) {
          router.replace(
            `/entrar?returnTo=${encodeURIComponent(`/estudos/${id}`)}`,
          );
        } else {
          setError(errorMessage(cause));
        }
      });
    return () => {
      active = false;
    };
  }, [id, router]);
  return (
    <main className="main-content">
      <p role={error ? 'alert' : 'status'}>
        {error || 'Abrindo o PDF na conversa…'}
      </p>
      {error && <Link href="/conversas">Voltar às conversas</Link>}
    </main>
  );
}
