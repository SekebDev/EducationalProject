'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Children, isValidElement, type ReactNode } from 'react';
import type { EducationalSkill } from '@study/contracts';
import { CodeBlock } from './CodeBlock';
import markdownStyles from './markdown.module.css';
import styles from '../../app/conversas/conversation-flow.module.css';
import skillStyles from './study-skills.module.css';

function flashcards(content: string) {
  const text = content.replace(/\r\n/g, '\n');
  const headings: number[] = [];
  let offset = 0;
  let fence: { character: string; length: number } | null = null;
  for (const line of text.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
    if (marker) {
      if (!fence) {
        fence = { character: marker[0]!, length: marker.length };
      } else if (
        marker[0] === fence.character &&
        marker.length >= fence.length &&
        /^ {0,3}(?:`+|~+)\s*$/u.test(line)
      ) {
        fence = null;
      }
    } else if (!fence && /^### Cartão [1-9]\d*\s*$/u.test(line)) {
      headings.push(offset);
    }
    offset += line.length + 1;
  }
  if (headings.length === 0) {
    return null;
  }
  const cards: { number: string; front: string; back: string }[] = [];
  const numbers = new Set<string>();
  for (const [index, start] of headings.entries()) {
    const segment = text
      .slice(start, headings[index + 1] ?? text.length)
      .trim();
    const match =
      /^### Cartão ([1-9]\d*)\s*\n[ \t]*\nFrente: ([\s\S]+?)\n[ \t]*\nVerso: ([\s\S]+)$/u.exec(
        segment,
      );
    if (
      !match ||
      !match[2]?.trim() ||
      !match[3]?.trim() ||
      numbers.has(match[1]!)
    ) {
      return null;
    }
    numbers.add(match[1]!);
    cards.push({ number: match[1]!, front: match[2]!, back: match[3]! });
  }
  return { introduction: text.slice(0, headings[0]).trim(), cards };
}

export function RichMessage({
  content,
  skill,
}: {
  content: string;
  skill?: EducationalSkill;
}) {
  const deck = skill === 'flashcards' ? flashcards(content) : null;
  return (
    <div className={styles.richMessage}>
      {deck ? (
        <>
          {deck.introduction && <SafeMarkdown content={deck.introduction} />}
          {deck.cards.map((card) => (
            <section
              key={card.number}
              className={skillStyles.flashcard}
              aria-label={`Cartão ${card.number}`}
            >
              <h4>Cartão {card.number}</h4>
              <SafeMarkdown content={card.front} />
              <details>
                <summary>Revelar resposta do cartão {card.number}</summary>
                <SafeMarkdown content={card.back} />
              </details>
            </section>
          ))}
        </>
      ) : (
        <SafeMarkdown content={content} />
      )}
    </div>
  );
}

function SafeMarkdown({ content }: { content: string }) {
  return (
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
  );
}
