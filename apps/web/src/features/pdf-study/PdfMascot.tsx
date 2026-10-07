'use client';

import styles from './pdf-controls.module.css';

export type PdfMascotState =
  | 'idle'
  | 'thinking'
  | 'walking'
  | 'pointing'
  | 'drawing';
const poses: Record<PdfMascotState, number> = {
  idle: 0,
  thinking: 1,
  walking: 2,
  pointing: 3,
  drawing: 4,
};

export function PdfMascot({
  state,
  reducedMotion,
  className = '',
  label,
}: {
  state: PdfMascotState;
  reducedMotion: boolean;
  className?: string | undefined;
  label?: string | undefined;
}) {
  return (
    <svg
      viewBox={`${poses[state] * 434.4} 180 434.4 350`}
      className={`${styles.mascot} ${className}`}
      data-state={state}
      data-reduced-motion={reducedMotion}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      <image href="/mascot/caderno-owl-poses.png" width={2172} height={724} />
    </svg>
  );
}
