'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import styles from '../../../app/evolucao/evolution.module.css';

export type EvolutionPoint = {
  level: string;
  date: string;
  points: number;
  possiblePoints: number;
  percentage: number;
  questionCount: number;
};

const levelColors = ['#285e4c', '#617e93', '#a76737', '#74649a', '#667537'];
const familiarLevels: Record<string, number> = {
  médio: 0,
  'ensino médio': 0,
  superior: 1,
  'ensino superior': 1,
  fundamental: 2,
  'ensino fundamental': 2,
};

export function colorForLevel(level: string) {
  const familiarColor = familiarLevels[level.trim().toLocaleLowerCase('pt-BR')];
  if (familiarColor !== undefined) {
    return levelColors[familiarColor]!;
  }
  let hash = 0;
  for (const character of level) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return levelColors[hash % levelColors.length]!;
}

export function displayDate(date: string, compact = false) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString('pt-BR', {
        timeZone: 'UTC',
        day: '2-digit',
        month: compact ? 'short' : '2-digit',
        ...(compact ? {} : { year: 'numeric' }),
      });
}

export function ProgressChart({ points }: { points: EvolutionPoint[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const reduceMotion = useReducedMotion();
  const id = useId();
  const dates = [...new Set(points.map((point) => point.date))].sort();
  const levels = [...new Set(points.map((point) => point.level))].sort();
  const height = 280;
  const left = 42;
  const right = width - 24;
  const top = 26;
  const bottom = height - 38;
  const timestamps = dates.map((date) => new Date(date).getTime());
  const start = timestamps[0] ?? 0;
  const end = timestamps.at(-1) ?? start;
  const x = (date: string) =>
    end === start
      ? (left + right) / 2
      : left +
        ((new Date(date).getTime() - start) / (end - start)) * (right - left);
  const y = (percentage: number) =>
    bottom - (Math.min(100, Math.max(0, percentage)) / 100) * (bottom - top);
  const tickIndexes = [
    ...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1]),
  ];

  useEffect(() => {
    if (!container.current) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(Math.max(280, Math.round(entry.contentRect.width)));
      }
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={container} className={styles.chart}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-labelledby={`${id}-title ${id}-description`}
      >
        <title id={`${id}-title`}>Aproveitamento ao longo do tempo</title>
        <desc id={`${id}-description`}>
          Cada linha representa um nível de estudo. Os pontos mostram o
          aproveitamento das respostas válidas em cada data. Consulte os valores
          completos em Ver dados do gráfico.
        </desc>
        {[0, 25, 50, 75, 100].map((value) => (
          <g key={value}>
            <line
              x1={left}
              x2={right}
              y1={y(value)}
              y2={y(value)}
              className={styles.gridLine}
            />
            <text
              x={left - 10}
              y={y(value) + 4}
              textAnchor="end"
              className={styles.axisLabel}
            >
              {value}%
            </text>
          </g>
        ))}
        {tickIndexes.map((index) => {
          const date = dates[index];
          return date ? (
            <text
              key={date}
              x={x(date)}
              y={height - 9}
              textAnchor={
                dates.length === 1
                  ? 'middle'
                  : index === 0
                    ? 'start'
                    : index === dates.length - 1
                      ? 'end'
                      : 'middle'
              }
              className={styles.axisLabel}
            >
              {displayDate(date, true)}
            </text>
          ) : null;
        })}
        {levels.map((level) => {
          const values = points
            .filter((point) => point.level === level)
            .sort((a, b) => a.date.localeCompare(b.date));
          return (
            <g key={level}>
              <motion.path
                d={values
                  .map(
                    (point, index) =>
                      `${index === 0 ? 'M' : 'L'} ${x(point.date)} ${y(point.percentage)}`,
                  )
                  .join(' ')}
                fill="none"
                stroke={colorForLevel(level)}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduceMotion ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.65,
                  ease: 'easeOut',
                }}
              />
              {values.map((point) => (
                <circle
                  key={point.date}
                  cx={x(point.date)}
                  cy={y(point.percentage)}
                  r={4.5}
                  fill="var(--paper)"
                  stroke={colorForLevel(level)}
                  strokeWidth={2.5}
                >
                  <title>{`${displayDate(point.date)} · ${level}: ${point.percentage.toLocaleString('pt-BR')}% · ${point.questionCount} questões`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <div className={styles.legend} aria-label="Níveis no gráfico">
        {levels.map((level) => (
          <span key={level}>
            <i
              aria-hidden="true"
              style={{ background: colorForLevel(level) }}
            />
            {level}
          </span>
        ))}
      </div>
    </div>
  );
}
