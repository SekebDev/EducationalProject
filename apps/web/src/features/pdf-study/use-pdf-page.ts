'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { StudyPage } from '@study/contracts';
import type {
  PDFDocumentProxy,
  PDFDocumentLoadingTask,
  RenderTask,
  TextLayer,
} from 'pdfjs-dist';
import { normalizedRotation } from './canvas-geometry';

export type PageBlock = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type PageContext = { blocks: PageBlock[]; image: string | null };

export function usePdfPage(
  materialId: string,
  page: StudyPage,
  zoom: number,
  rotation: number,
  canvas: RefObject<HTMLCanvasElement | null>,
  textLayer: RefObject<HTMLDivElement | null>,
  onContext: (context: PageContext) => void,
) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(page.kind === 'original');
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const contextCallback = useRef(onContext);
  contextCallback.current = onContext;

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    setDocument(null);
    setError(null);
    async function load() {
      try {
        const pdfjs = await import('pdfjs-dist');
        if (cancelled) {
          return;
        }
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.mjs',
          import.meta.url,
        ).toString();
        task = pdfjs.getDocument({
          url: `/api/v1/materials/${encodeURIComponent(materialId)}/content`,
          withCredentials: true,
        });
        const result = await task.promise;
        if (!cancelled) {
          setDocument(result);
        }
      } catch {
        if (!cancelled) {
          setError('Não foi possível abrir o PDF. Tente novamente.');
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [materialId, retry]);

  useEffect(() => {
    if (page.kind === 'tutor') {
      setLoading(false);
      setError(null);
      contextCallback.current({ blocks: [], image: null });
      return;
    }
    if (
      !document ||
      !canvas.current ||
      !textLayer.current ||
      page.sourcePageIndex === null
    ) {
      return;
    }
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let layer: TextLayer | undefined;
    setLoading(true);
    setError(null);
    contextCallback.current({ blocks: [], image: null });
    const target = canvas.current;
    const textTarget = textLayer.current;
    async function render() {
      try {
        const pdfjs = await import('pdfjs-dist');
        const pdfPage = await document!.getPage(page.sourcePageIndex! + 1);
        if (cancelled) {
          return;
        }
        const viewport = pdfPage.getViewport({
          scale: zoom,
          rotation: normalizedRotation(rotation),
        });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        target.width = Math.ceil(viewport.width * ratio);
        target.height = Math.ceil(viewport.height * ratio);
        renderTask = pdfPage.render({
          canvas: target,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        });
        const rendered = renderTask.promise;
        // Navigation can cancel rendering while text extraction is still pending.
        void rendered.catch(() => undefined);
        const text = await pdfPage.getTextContent();
        if (cancelled) {
          return;
        }
        textTarget.replaceChildren();
        textTarget.style.setProperty('--total-scale-factor', String(zoom));
        layer = new pdfjs.TextLayer({
          textContentSource: text,
          container: textTarget,
          viewport: pdfPage.getViewport({ scale: zoom, rotation: 0 }),
        });
        await Promise.all([rendered, layer.render()]);
        if (cancelled) {
          return;
        }
        const blocks = text.items.flatMap((item, index): PageBlock[] => {
          if (!('str' in item) || !item.str.trim()) {
            return [];
          }
          const fontHeight = Math.hypot(
            item.transform[2] ?? 0,
            item.transform[3] ?? 0,
          );
          const x = Math.max(
            0,
            Math.min(page.width, (item.transform[4] ?? 0) - page.cropX),
          );
          const y = Math.max(
            0,
            Math.min(
              page.height,
              page.cropY + page.height - (item.transform[5] ?? 0) - fontHeight,
            ),
          );
          return [
            {
              id: `${page.id}:${index}`,
              text: item.str,
              x,
              y,
              width: Math.max(0, Math.min(page.width - x, item.width)),
              height: Math.min(page.height - y, fontHeight),
            },
          ];
        });
        // The tutor receives an unrotated crop image in the same coordinates as the annotations.
        const imageCanvas = window.document.createElement('canvas');
        const imageScale = Math.min(
          1.5,
          1100 / Math.max(page.width, page.height),
        );
        const imageViewport = pdfPage.getViewport({
          scale: imageScale,
          rotation: 0,
        });
        imageCanvas.width = Math.ceil(imageViewport.width);
        imageCanvas.height = Math.ceil(imageViewport.height);
        const imageRender = pdfPage.render({
          canvas: imageCanvas,
          viewport: imageViewport,
        });
        await imageRender.promise;
        if (cancelled) {
          return;
        }
        let image = imageCanvas.toDataURL('image/png');
        while (image.length > 1_450_000 && imageCanvas.width > 192) {
          const smaller = window.document.createElement('canvas');
          smaller.width = Math.ceil(imageCanvas.width * 0.75);
          smaller.height = Math.ceil(imageCanvas.height * 0.75);
          smaller
            .getContext('2d')
            ?.drawImage(imageCanvas, 0, 0, smaller.width, smaller.height);
          imageCanvas.width = smaller.width;
          imageCanvas.height = smaller.height;
          imageCanvas.getContext('2d')?.drawImage(smaller, 0, 0);
          image = imageCanvas.toDataURL('image/png');
        }
        contextCallback.current({
          blocks,
          image: image.length <= 1_450_000 ? image : null,
        });
        setLoading(false);
      } catch (caught) {
        if (
          cancelled ||
          (caught instanceof Error &&
            caught.name === 'RenderingCancelledException')
        ) {
          return;
        }
        setError(
          'Esta página não pôde ser exibida. Tente carregá-la novamente.',
        );
        setLoading(false);
      }
    }
    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      layer?.cancel();
    };
  }, [
    document,
    page.id,
    page.kind,
    page.sourcePageIndex,
    page.cropX,
    page.cropY,
    page.height,
    page.width,
    zoom,
    rotation,
    canvas,
    textLayer,
  ]);

  return { loading, error, retry: () => setRetry((value) => value + 1) };
}
