'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

const storageKey = 'caderno-conversation-pane-sizes';
const dividerWidth = 8;
type Preferences = { chatPercent: number; materialsWidth: number };
const defaults: Preferences = { chatPercent: 45, materialsWidth: 292 };
export function clampPaneSize(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
function restoreSizes(): Preferences {
  try {
    const saved = JSON.parse(
      localStorage.getItem(storageKey) ?? 'null',
    ) as Partial<Preferences> | null;
    return {
      chatPercent:
        typeof saved?.chatPercent === 'number' &&
        Number.isFinite(saved.chatPercent)
          ? clampPaneSize(saved.chatPercent, 10, 90)
          : defaults.chatPercent,
      materialsWidth:
        typeof saved?.materialsWidth === 'number' &&
        Number.isFinite(saved.materialsWidth)
          ? clampPaneSize(saved.materialsWidth, 240, 440)
          : defaults.materialsWidth,
    };
  } catch {
    return defaults;
  }
}
export function useConversationPaneSizes() {
  const [preferences, setPreferences] = useState(defaults);
  const current = useRef(preferences);
  const observer = useRef<ResizeObserver | null>(null);
  const [width, setWidth] = useState(0);
  const [pdfEnabled, setPdfEnabled] = useState(false);
  const [materialsEnabled, setMaterialsEnabled] = useState(false);
  const [dragging, setDragging] = useState(false);
  const containerRef = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) {
      return;
    }
    setWidth(node.clientWidth);
    observer.current = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.current.observe(node);
  }, []);
  useEffect(() => {
    const restored = restoreSizes();
    current.current = restored;
    setPreferences(restored);
    const pdfMedia = window.matchMedia('(min-width: 1001px)');
    const materialsMedia = window.matchMedia('(min-width: 1200px)');
    const update = () => {
      setPdfEnabled(pdfMedia.matches);
      setMaterialsEnabled(materialsMedia.matches);
    };
    update();
    pdfMedia.addEventListener('change', update);
    materialsMedia.addEventListener('change', update);
    return () => {
      observer.current?.disconnect();
      pdfMedia.removeEventListener('change', update);
      materialsMedia.removeEventListener('change', update);
    };
  }, []);
  function change(key: keyof Preferences, value: number) {
    const next = { ...current.current, [key]: value };
    current.current = next;
    setPreferences(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Resizing remains available when preference storage is disabled.
    }
  }
  const available = Math.max(1, width - dividerWidth);
  const chatMin = (Math.min(300, available * 0.45) / available) * 100;
  const chatMax = 100 - (Math.min(380, available * 0.55) / available) * 100;
  const chatPercent = clampPaneSize(preferences.chatPercent, chatMin, chatMax);
  const materialsMin = Math.min(240, available * 0.4);
  const materialsMax = Math.max(materialsMin, Math.min(440, available - 360));
  const materialsWidth = clampPaneSize(
    preferences.materialsWidth,
    materialsMin,
    materialsMax,
  );
  const style = {
    '--chat-panel-width': width
      ? `${(available * chatPercent) / 100}px`
      : '45%',
    '--materials-panel-width': width ? `${materialsWidth}px` : '292px',
  } as CSSProperties;
  return {
    containerRef,
    style,
    dragging,
    pdf: {
      value: chatPercent,
      min: chatMin,
      max: chatMax,
      step: 2,
      pixelsPerUnit: available / 100,
      reverse: false,
      enabled: pdfEnabled,
      onChange: (value: number) =>
        change('chatPercent', clampPaneSize(value, chatMin, chatMax)),
      onReset: () => change('chatPercent', defaults.chatPercent),
      onDraggingChange: setDragging,
    },
    materials: {
      value: materialsWidth,
      min: materialsMin,
      max: materialsMax,
      step: 20,
      pixelsPerUnit: 1,
      reverse: true,
      enabled: materialsEnabled,
      onChange: (value: number) =>
        change(
          'materialsWidth',
          clampPaneSize(value, materialsMin, materialsMax),
        ),
      onReset: () => change('materialsWidth', defaults.materialsWidth),
      onDraggingChange: setDragging,
    },
  };
}
