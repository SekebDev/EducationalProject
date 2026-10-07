import { createHash } from 'node:crypto';
import type { StudyBlock, StudyLine, StudyRect } from '@study/contracts';
import { PublicError } from '../../infrastructure/http/public-error.js';

function overlaps(a: StudyRect, b: StudyRect) {
  return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
    Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
}

/** PDF.js text items are fragments: join adjacent fragments sharing a baseline,
 * keep distant columns separate, then anchor selection to those verified lines. */
export function studyPageLines(blocks: StudyBlock[], selection: { rects: StudyRect[] } | null): StudyLine[] {
  const groups: StudyBlock[][] = [];
  for (const block of [...blocks].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (block.id.endsWith(':visual')) {
      groups.push([block]);
      continue;
    }
    const matching = groups.findLast((group) => {
      const previous = group.at(-1)!;
      const tolerance = Math.max(2, Math.min(previous.height, block.height) * 0.4);
      const sameBaseline = Math.abs(previous.y + previous.height - block.y - block.height) <= tolerance;
      const gap = block.x - previous.x - previous.width;
      return !previous.id.endsWith(':visual') && sameBaseline && gap >= -2 && gap <= Math.max(previous.height, block.height) * 4;
    });
    if (matching) matching.push(block);
    else groups.push([block]);
  }
  const lines = groups.sort((a, b) => a[0]!.y - b[0]!.y || a[0]!.x - b[0]!.x)
    .filter((group) => !selection?.rects.length || group.some((block) => selection.rects.some((rect) => overlaps(block, rect))))
    .map((group): StudyLine => {
      const ordered = group.sort((a, b) => a.x - b.x);
      const first = ordered[0]!;
      const x = Math.min(...ordered.map((block) => block.x));
      const y = Math.min(...ordered.map((block) => block.y));
      const right = Math.max(...ordered.map((block) => block.x + block.width));
      const bottom = Math.max(...ordered.map((block) => block.y + block.height));
      return {
        id: `${first.id.split(':')[0]}:line:${createHash('sha256').update(ordered.map((block) => block.id).join('|')).digest('hex').slice(0, 16)}`,
        text: ordered.map((block) => block.text).join(' '),
        blockIds: ordered.map((block) => block.id),
        rects: right > x && bottom > y ? [{ x, y, width: right - x, height: bottom - y }] : [],
      };
    });
  if (selection?.rects.length && lines.length === 0) {
    throw new PublicError(422, 'STUDY_SELECTION_EMPTY', 'A seleção não coincide com texto legível do PDF. Selecione as linhas novamente.');
  }
  if (selection?.rects.length && lines.length > 120) {
    throw new PublicError(422, 'STUDY_SELECTION_TOO_LONG', 'Selecione até 120 linhas por aula. Divida esse trecho para estudar sem cortar a explicação.');
  }
  return lines;
}
