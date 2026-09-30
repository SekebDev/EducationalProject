'use client';

import { useEffect, useId, useRef, useState } from 'react';
import styles from './markdown.module.css';

let renderer: Promise<(typeof import('mermaid'))['default']> | undefined;
function getRenderer() {
  renderer ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      maxTextSize: 12_000,
      maxEdges: 100,
      theme: 'base',
      fontFamily: 'DM Sans Variable, sans-serif',
      flowchart: { htmlLabels: false, useMaxWidth: true },
      themeVariables: {
        primaryColor: '#dce8d6',
        primaryTextColor: '#1d352d',
        primaryBorderColor: '#8fa58e',
        lineColor: '#326a53',
        secondaryColor: '#f8f5ee',
        tertiaryColor: '#f7e6d7',
      },
    });
    return mermaid;
  });
  return renderer;
}

export function MermaidDiagram({ source }: { source: string }) {
  const id = useId().replace(/[^a-z0-9]/giu, '');
  const host = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{
    source: string;
    svg?: string;
    failed?: boolean;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const element = host.current;
    async function render() {
      try {
        // File/model text cannot override the application's renderer configuration.
        if (source.length > 12_000 || /%%\s*\{|^\s*---/u.test(source)) {
          throw new Error('DIAGRAM_CONFIG_NOT_ALLOWED');
        }
        const mermaid = await getRenderer();
        if (!active || !element) {
          return;
        }
        const { svg } = await mermaid.render(`diagram${id}`, source, element);
        if (active) {
          setResult({ source, svg });
        }
      } catch {
        if (active) {
          setResult({ source, failed: true });
        }
      } finally {
        element?.replaceChildren();
      }
    }
    void render();
    return () => {
      active = false;
    };
  }, [source, id]);

  return (
    <div
      className={styles.diagramBody}
      tabIndex={0}
      role="region"
      aria-label="Diagrama: role horizontalmente para ver os detalhes"
    >
      <div ref={host} className={styles.renderHost} aria-hidden="true" />
      {result?.source === source && result.svg ? (
        // SVG is displayed as an image: no scripts, callbacks or HTML from diagrams execute in the page.
        <img
          className={styles.diagramImage}
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`}
          alt="Diagrama Mermaid"
        />
      ) : result?.source === source && result.failed ? (
        <>
          <p className={styles.diagramNotice} role="status">
            Não foi possível desenhar este diagrama. O código está disponível
            abaixo.
          </p>
          <pre tabIndex={0}>
            <code>{source}</code>
          </pre>
        </>
      ) : (
        <p className={styles.diagramNotice} role="status">
          Preparando diagrama…
        </p>
      )}
    </div>
  );
}
