'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Children, isValidElement, type ReactNode } from 'react';
import { CodeBlock } from './CodeBlock';
import markdownStyles from './markdown.module.css';
import styles from '../../app/conversas/conversation-flow.module.css';

export function RichMessage({ content }: { content: string }) {
  return (
    <div className={styles.richMessage}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => (
            <span className={styles.imageDescription}>
              {alt || 'Imagem mencionada na resposta'}
            </span>
          ),
          table: ({ children }) => (
            <div
              className={styles.tableScroll}
              tabIndex={0}
              role="region"
              aria-label="Tabela da resposta"
            >
              <table>{children}</table>
            </div>
          ),
          h1: ({ children }) => (
            <h3 className={markdownStyles.heading1}>{children}</h3>
          ),
          h2: ({ children }) => (
            <h3 className={markdownStyles.heading2}>{children}</h3>
          ),
          h3: ({ children }) => (
            <h4 className={markdownStyles.heading3}>{children}</h4>
          ),
          pre: ({ children }) => {
            if (
              !isValidElement<{ className?: string; children?: ReactNode }>(
                children,
              )
            ) {
              return <pre>{children}</pre>;
            }
            const language =
              children.props.className?.match(/language-([\w+-]+)/u)?.[1] ?? '';
            const code = Children.toArray(children.props.children)
              .join('')
              .replace(/\n$/u, '');
            return <CodeBlock code={code} language={language} />;
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
