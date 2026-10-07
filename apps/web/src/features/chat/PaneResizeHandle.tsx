'use client';

import {
  useEffect,
  useRef,
  useId,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { clampPaneSize } from './use-conversation-pane-sizes';
import styles from './pane-resize-handle.module.css';

type Props = {
  label: string;
  controls: string;
  valueText: string;
  kind: 'pdf' | 'materials';
  value: number;
  min: number;
  max: number;
  step: number;
  pixelsPerUnit: number;
  reverse: boolean;
  enabled: boolean;
  onChange(value: number): void;
  onReset(): void;
  onDraggingChange(dragging: boolean): void;
};
type Drag = { pointerId: number; startX: number; value: number };
export function PaneResizeHandle(props: Props) {
  const helpId = useId();
  const element = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const latest = useRef(props);
  latest.current = props;
  function stop(restore = false) {
    const previous = drag.current;
    drag.current = null;
    if (!previous) {
      return;
    }
    if (restore) {
      latest.current.onChange(previous.value);
    }
    latest.current.onDraggingChange(false);
    if (element.current?.hasPointerCapture(previous.pointerId)) {
      element.current.releasePointerCapture(previous.pointerId);
    }
  }
  useEffect(() => {
    const blur = () => stop(true);
    window.addEventListener('blur', blur);
    return () => {
      stop();
      window.removeEventListener('blur', blur);
    };
  }, []);
  useEffect(() => {
    if (!props.enabled) {
      stop();
    }
  }, [props.enabled]);
  function start(event: PointerEvent<HTMLDivElement>) {
    if (!props.enabled || event.button !== 0 || !event.isPrimary) {
      return;
    }
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      value: props.value,
    };
    props.onDraggingChange(true);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    const delta = (event.clientX - active.startX) / props.pixelsPerUnit;
    const value = active.value + delta * (props.reverse ? -1 : 1);
    props.onChange(clampPaneSize(value, props.min, props.max));
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const direction = props.reverse ? -1 : 1;
    const step = props.step * (event.shiftKey ? 5 : 1);
    const keys: Record<string, number> = {
      ArrowLeft: props.value - step * direction,
      ArrowRight: props.value + step * direction,
      Home: props.min,
      End: props.max,
    };
    const nextValue = keys[event.key];
    if (event.key === 'Enter') {
      event.preventDefault();
      props.onReset();
    } else if (event.key === 'Escape' && drag.current) {
      event.preventDefault();
      stop(true);
    } else if (nextValue !== undefined) {
      event.preventDefault();
      props.onChange(clampPaneSize(nextValue, props.min, props.max));
    }
  }
  return (
    <div
      ref={element}
      role="separator"
      tabIndex={props.enabled ? 0 : -1}
      aria-label={props.label}
      aria-controls={props.controls}
      aria-orientation="vertical"
      aria-valuemin={Math.round(props.min)}
      aria-valuemax={Math.round(props.max)}
      aria-valuenow={Math.round(props.value)}
      aria-valuetext={props.valueText}
      aria-describedby={helpId}
      className={styles.handle}
      data-kind={props.kind}
      title="Arraste para ajustar. Duplo clique ou Enter restaura o tamanho."
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={() => stop()}
      onPointerCancel={() => stop(true)}
      onLostPointerCapture={() => stop()}
      onKeyDown={keyboard}
      onDoubleClick={props.onReset}
    >
      <span aria-hidden="true" className={styles.grip} />
      <span className="sr-only" id={helpId}>
        Use as setas para ajustar. Shift aumenta o passo. Home e End selecionam
        os limites. Enter ou duplo clique restaura o tamanho inicial.
      </span>
    </div>
  );
}
