'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ConversationMaterial } from '../materials/MaterialsPanel';
import type { PdfWorkspaceBridge } from '../pdf-study/PdfWorkspaceBridge';
import { errorMessage } from '../../lib/api';

export function useConversationPdf({
  conversationId,
  materials,
  loading,
  onError,
}: {
  conversationId: string;
  materials: ConversationMaterial[];
  loading: boolean;
  onError(message: string): void;
}) {
  const router = useRouter();
  const parameters = useSearchParams();
  const requested = parameters.get('pdf');
  const requestedPage = parameters.get('pdfPage');
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [bridge, setBridge] = useState<PdfWorkspaceBridge | null>(null);
  const latestBridge = useRef(bridge);
  latestBridge.current = bridge;
  const updateUrl = useCallback(
    (pdf: string | null, pageId?: string) => {
      const params = new URLSearchParams(window.location.search);
      if (pdf) {
        params.set('pdf', pdf);
      } else {
        params.delete('pdf');
      }
      if (pageId) {
        params.set('pdfPage', pageId);
      } else {
        params.delete('pdfPage');
      }
      const suffix = params.toString();
      router.replace(
        `/conversas/${conversationId}${suffix ? `?${suffix}` : ''}`,
        { scroll: false },
      );
    },
    [conversationId, router],
  );

  useEffect(() => {
    if (!requested) {
      latestBridge.current = null;
      setMaterialId(null);
      setBridge(null);
      return;
    }
    if (loading) {
      return;
    }
    const material = materials.find(
      (item) => item.id === requested && item.mime === 'application/pdf',
    );
    if (!material) {
      latestBridge.current = null;
      setMaterialId(null);
      setBridge(null);
      onError(
        'Este PDF não está disponível nesta conversa. Abra um dos arquivos enviados aqui.',
      );
      updateUrl(null);
      return;
    }
    if (requested !== materialId) {
      latestBridge.current = null;
      setBridge(null);
      setMaterialId(requested);
    }
  }, [requested, materialId, materials, loading, onError, updateUrl]);
  useEffect(() => {
    if (requestedPage && bridge?.ready) {
      bridge.jumpPage(requestedPage);
    }
  }, [requestedPage, bridge?.ready]);

  const receiveBridge = useCallback((next: PdfWorkspaceBridge | null) => {
    setBridge(next);
  }, []);
  function open(id: string, pageId?: string) {
    if (latestBridge.current?.busy) {
      onError('Aguarde a explicação atual terminar antes de trocar o PDF.');
      return;
    }
    onError('');
    updateUrl(id, pageId);
  }
  async function close() {
    if (latestBridge.current?.busy) {
      return;
    }
    try {
      if (
        latestBridge.current?.ready &&
        !(await latestBridge.current.flush())
      ) {
        onError(
          'O PDF tem alterações pendentes. Tente salvar antes de fechar.',
        );
        return;
      }
      setMaterialId(null);
      setBridge(null);
      updateUrl(null);
    } catch (cause) {
      onError(errorMessage(cause));
    }
  }
  return {
    materialId: loading ? null : materialId,
    bridge: !loading && materialId === requested ? bridge : null,
    receiveBridge,
    open,
    close,
  };
}
