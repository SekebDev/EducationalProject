'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MermaidDiagram } from './MermaidDiagram';
import styles from './markdown.module.css';

export function CodeBlock({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [highlighted, setHighlighted] = useState<{
    code: string;
    html: string;
  } | null>(null);
  const [view, setView] = useState<'diagram' | 'code'>('diagram');
  const diagram = language.toLowerCase() === 'mermaid';

  useEffect(() => {
    if (diagram || !language || code.length > 30_000) {
      return;
    }
    let active = true;
    void import('highlight.js/lib/common')
      .then(({ default: highlighter }) => {
        if (active && highlighter.getLanguage(language)) {
          // highlight.js escapes source text before producing its own span markup.
          setHighlighted({
            code,
            html: highlighter.highlight(code, {
              language,
              ignoreIllegals: true,
            }).value,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [code, language, diagram]);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

  return (
    <section
      className={styles.codeBlock}
      aria-label={
        diagram ? 'Bloco de diagrama' : `Código ${language || 'texto'}`
      }
    >
      <div className={styles.codeToolbar}>
        {diagram ? (
          <div
            className={styles.viewSwitch}
            aria-label="Visualização do diagrama"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={view === 'diagram'}
              onClick={() => setView('diagram')}
            >
              Diagrama
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={view === 'code'}
              onClick={() => setView('code')}
            >
              Código
            </Button>
          </div>
        ) : (
          <span>{language || 'texto'}</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void copy()}
          aria-label="Copiar código"
        >
          {copied ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}
          <span role="status">{copied ? 'Copiado' : 'Copiar'}</span>
        </Button>
      </div>
      {diagram && view === 'diagram' ? (
        <MermaidDiagram source={code} />
      ) : (
        <pre tabIndex={0} aria-label="Código para leitura">
          {highlighted?.code === code ? (
            <code dangerouslySetInnerHTML={{ __html: highlighted.html }} />
          ) : (
            <code>{code}</code>
          )}
        </pre>
      )}
      {copyError && (
        <p className={styles.codeError} role="status">
          Não foi possível copiar. Selecione o código e copie manualmente.
        </p>
      )}
    </section>
  );
}
