'use client';

import {
  MousePointer2,
  RectangleHorizontal,
  Highlighter,
  Circle,
  MoveUpRight,
  Pencil,
  StickyNote,
  Move,
  Undo2,
  Redo2,
  FilePlus2,
  Download,
  Trash2,
  RotateCw,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import { studyColors, type StudyAnnotation } from '@study/contracts';
import type { PdfTool } from './PdfCanvas';
import styles from './pdf-controls.module.css';

export type PdfToolbarProps = {
  tool: PdfTool;
  setTool(tool: PdfTool): void;
  color: StudyAnnotation['color'];
  setColor(color: StudyAnnotation['color']): void;
  zoom: number;
  setZoom(zoom: number): void;
  viewRotation: number;
  setViewRotation(rotation: number): void;
  saveStatus: string;
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  onAddPage(): void;
  onExport(): void;
  onDelete(): void;
  hasSelection: boolean;
  onHighlightSelection(): void;
  showMascot: boolean;
  setShowMascot(value: boolean): void;
  reducedMotion: boolean;
  setReducedMotion(value: boolean): void;
};
const tools: { value: PdfTool; label: string; icon: LucideIcon }[] = [
  { value: 'select', label: 'Selecionar texto', icon: MousePointer2 },
  { value: 'region', label: 'Selecionar área', icon: RectangleHorizontal },
  { value: 'highlight', label: 'Destacar', icon: Highlighter },
  { value: 'ellipse', label: 'Circular', icon: Circle },
  { value: 'arrow', label: 'Seta', icon: MoveUpRight },
  { value: 'pen', label: 'Desenhar', icon: Pencil },
  { value: 'note', label: 'Escrever nota', icon: StickyNote },
  { value: 'move', label: 'Mover anotação', icon: Move },
];
const colorNames = ['Amarelo', 'Verde', 'Vermelho', 'Azul'];

function Action({
  icon: Icon,
  label,
  onClick,
  disabled,
  text = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick(): void;
  disabled?: boolean;
  text?: boolean;
}) {
  return (
    <button
      type="button"
      className={styles.action}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <Icon size={17} aria-hidden="true" />
      {text && <span>{label}</span>}
    </button>
  );
}

export function PdfToolbar(props: PdfToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div
        className={styles.toolGroup}
        role="group"
        aria-label="Ferramentas da página"
      >
        {tools.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            className={styles.action}
            aria-label={label}
            title={label}
            aria-pressed={props.tool === value}
            onClick={() => props.setTool(value)}
            disabled={props.busy}
          >
            <Icon size={18} aria-hidden="true" />
            <span className={styles.toolLabel}>{label}</span>
          </button>
        ))}
      </div>
      <div
        className={styles.toolGroup}
        role="group"
        aria-label="Cor da anotação"
      >
        {studyColors.map((color, index) => (
          <button
            type="button"
            key={color}
            className={styles.color}
            style={{ backgroundColor: color }}
            aria-label={colorNames[index]}
            aria-pressed={props.color === color}
            onClick={() => props.setColor(color)}
            disabled={props.busy}
          >
            {props.color === color && <span aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
      <div
        className={styles.toolGroup}
        role="group"
        aria-label="Zoom e rotação"
      >
        <Action
          icon={ZoomOut}
          label="Diminuir zoom"
          onClick={() =>
            props.setZoom(Math.max(0.4, Number((props.zoom - 0.1).toFixed(1))))
          }
          disabled={props.zoom <= 0.4}
        />
        <output className={styles.zoom} aria-label="Zoom">
          {Math.round(props.zoom * 100)}%
        </output>
        <Action
          icon={ZoomIn}
          label="Aumentar zoom"
          onClick={() =>
            props.setZoom(Math.min(2.5, Number((props.zoom + 0.1).toFixed(1))))
          }
          disabled={props.zoom >= 2.5}
        />
        <Action
          icon={RotateCw}
          label="Girar visualização"
          onClick={() => props.setViewRotation((props.viewRotation + 90) % 360)}
        />
      </div>
      <div
        className={styles.toolGroup}
        role="group"
        aria-label="Editar caderno"
      >
        <Action
          icon={Undo2}
          label="Desfazer"
          onClick={props.onUndo}
          disabled={props.busy || !props.canUndo}
        />
        <Action
          icon={Redo2}
          label="Refazer"
          onClick={props.onRedo}
          disabled={props.busy || !props.canRedo}
        />
        <Action
          icon={Trash2}
          label="Excluir anotação selecionada"
          onClick={props.onDelete}
          disabled={props.busy}
        />
        <Action
          icon={Highlighter}
          label="Destacar seleção"
          onClick={props.onHighlightSelection}
          disabled={props.busy || !props.hasSelection}
        />
      </div>
      <div className={styles.documentActions}>
        <Action
          icon={FilePlus2}
          label="Página de estudo"
          onClick={props.onAddPage}
          disabled={props.busy}
          text
        />
        <Action
          icon={Download}
          label="Exportar PDF"
          onClick={props.onExport}
          disabled={props.busy}
          text
        />
        <details className={styles.preferences}>
          <summary>Preferências</summary>
          <div>
            <label>
              <input
                type="checkbox"
                checked={props.showMascot}
                onChange={(event) => props.setShowMascot(event.target.checked)}
              />{' '}
              Mostrar mascote
            </label>
            <label>
              <input
                type="checkbox"
                checked={props.reducedMotion}
                onChange={(event) =>
                  props.setReducedMotion(event.target.checked)
                }
              />{' '}
              Reduzir movimentos
            </label>
          </div>
        </details>
      </div>
      <span className={styles.saveStatus} role="status">
        {props.saveStatus}
      </span>
    </div>
  );
}
