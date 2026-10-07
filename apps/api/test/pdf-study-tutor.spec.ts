import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { studyEditorStateSchema, validateStudyState } from '@study/contracts';
import type { StudyPage } from '@study/contracts';
import { applyTutorPlan } from '../src/modules/pdf-study/tutor-layout.js';
import type { FlatTutorPlan } from '../src/modules/pdf-study/tutor-layout.js';
import { studyPageLines } from '../src/modules/pdf-study/pdf-lines.js';
import {
  explainPdf,
  streamedAnswerPrefix,
  validateTutorPlan,
} from '../src/modules/pdf-study/tutor.js';
import type { PdfTutorInput } from '../src/modules/pdf-study/tutor.js';

const sdk = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('openai', () => ({
  default: class {
    responses = { create: sdk.create };
  },
}));

const original: StudyPage = {
  id: randomUUID(),
  kind: 'original',
  sourcePageId: null,
  sourcePageIndex: 0,
  title: 'Página 1',
  width: 595,
  height: 842,
  cropX: 0,
  cropY: 0,
  rotation: 0,
};
const block = {
  id: 'block-1',
  text: 'Conceito do professor',
  x: 50,
  y: 75,
  width: 220,
  height: 20,
};
const flatOutput = () => ({
  answer: 'Uma explicação.',
  basis: 'source' as const,
  citedBlockIds: [block.id],
  notes: [],
  shapes: [{ kind: 'ellipse' as const, blockId: block.id }],
  diagram: null,
  needsStudyPage: true,
  title: 'Estudo',
});
const plan = (): FlatTutorPlan => ({ ...flatOutput(), sourceBlocks: [block] });
const output = () => ({
  answer: 'Uma explicação.',
  basis: 'source' as const,
  citedBlockIds: [block.id],
  steps: [
    {
      lineId: null as string | null,
      explanation: 'Conceito explicado.',
      basis: 'source' as const,
      citedBlockIds: [block.id],
      diagram: null,
    },
  ],
  title: 'Estudo',
});
const streamedOutput = () => ({
  ...output(),
  steps: [
    { ...output().steps[0]!, lineId: studyPageLines([block], null)[0]!.id },
  ],
});
const input = (): PdfTutorInput => ({
  question: 'Explique',
  page: original,
  blocks: [block],
  selection: null,
  image: null,
  history: [],
  config: {
    nodeEnv: 'test',
    apiPort: 3001,
    databaseUrl: 'postgres://fixture/db',
    appOrigin: 'http://localhost:3000',
    sessionSecret: 'fixture',
    aiProvider: 'openai',
    openAiApiKey: 'fixture',
    smtpHost: 'localhost',
    smtpPort: 1025,
    smtpFrom: 'test@example.com',
    storageDriver: 'local',
    storageLocalPath: '.local-storage',
  },
});

describe('PDF tutor plan and layout', () => {
  beforeEach(() => {
    sdk.create.mockReset();
  });
  it('decodes partial JSON safely including escapes and surrogate pairs', () => {
    expect(streamedAnswerPrefix('{"answer":"linha\\ntexto\\u00')).toBe(
      'linha\ntexto',
    );
    expect(streamedAnswerPrefix('{"answer":"emoji \\uD83D')).toBe('emoji ');
    expect(streamedAnswerPrefix('{"answer":"emoji \\uD83D\\uDE00"')).toBe(
      'emoji 😀',
    );
    expect(streamedAnswerPrefix('{"notes":[{"text":"answer"}]}')).toBe('');
  });
  it('rejects invented citations and diagram indices', () => {
    expect(() =>
      validateTutorPlan({ ...output(), citedBlockIds: ['fabricated'] }, [
        block,
      ]),
    ).toThrow('AI_CITATIONS_INVALID');
    expect(() =>
      validateTutorPlan({ ...output(), basis: 'general' }, [block]),
    ).toThrow('AI_CITATIONS_INVALID');
    expect(() =>
      validateTutorPlan(
        {
          ...output(),
          steps: [{ ...output().steps[0]!, citedBlockIds: ['fabricated'] }],
        },
        [block],
      ),
    ).toThrow('AI_CITATIONS_INVALID');
    expect(() =>
      validateTutorPlan(
        {
          ...output(),
          steps: [
            {
              ...output().steps[0]!,
              diagram: {
                layout: 'flow',
                nodes: ['a'],
                edges: [{ from: 0, to: 4, label: null }],
              },
            },
          ],
        },
        [block],
      ),
    ).toThrow('AI_CITATIONS_INVALID');
  });
  it('paginates the complete answer and keeps notes out of the professor page', () => {
    const long = Array.from(
      { length: 220 },
      (_, index) => `Linha ${index} da explicação completa.`,
    ).join('\n');
    const result = applyTutorPlan(
      { pages: [original], annotations: [] },
      original.id,
      null,
      { ...plan(), answer: long },
      randomUUID(),
    );
    expect(result.pageIds.length).toBeGreaterThan(5);
    expect(validateStudyState(result.state, [original])).toBeNull();
    expect(studyEditorStateSchema.safeParse(result.state).success).toBe(true);
    const notes = result.state.annotations.filter(
      (annotation) => annotation.kind === 'note' && annotation.fontSize === 14,
    );
    expect(notes.map((annotation) => annotation.text).join('\n')).toBe(long);
    expect(notes.every((annotation) => annotation.pageId !== original.id)).toBe(
      true,
    );
    expect(result.state.pages[0]).toEqual(original);
  });
  it('inserts new notes after existing related notes and before the next PDF page', () => {
    const next = { ...original, id: randomUUID(), sourcePageIndex: 1 };
    const previous: StudyPage = {
      ...original,
      id: randomUUID(),
      kind: 'tutor',
      sourcePageId: original.id,
      sourcePageIndex: null,
    };
    const result = applyTutorPlan(
      { pages: [original, previous, next], annotations: [] },
      previous.id,
      null,
      plan(),
      randomUUID(),
    );
    expect(result.state.pages.slice(0, 2)).toEqual([original, previous]);
    expect(result.state.pages.at(-1)).toEqual(next);
    expect(result.state.pages[2]?.sourcePageId).toBe(original.id);
  });
  it('draws only verified geometry, not rectangles supplied with selection', () => {
    const result = applyTutorPlan(
      { pages: [original], annotations: [] },
      original.id,
      { text: 'forged', rects: [{ x: 0, y: 0, width: 595, height: 842 }] },
      plan(),
      randomUUID(),
    );
    const highlight = result.state.annotations.find(
      (annotation) => annotation.kind === 'highlight',
    );
    expect(highlight).toMatchObject({
      x: block.x,
      y: block.y,
      width: block.width,
      height: block.height,
    });
  });
  it('persists a diagram and all relations across study pages', () => {
    const result = applyTutorPlan(
      { pages: [original], annotations: [] },
      original.id,
      null,
      {
        ...plan(),
        diagram: { nodes: ['causa', 'efeito'], edges: [{ from: 0, to: 1 }] },
      },
      randomUUID(),
    );
    expect(validateStudyState(result.state, [original])).toBeNull();
    expect(
      result.state.annotations.some(
        (annotation) => annotation.kind === 'arrow',
      ),
    ).toBe(true);
    expect(
      result.state.annotations.some(
        (annotation) => annotation.text === 'Ligação: 1 para 2',
      ),
    ).toBe(true);
  });
  it('streams one structured Responses request and returns validated evidence', async () => {
    const json = JSON.stringify(streamedOutput());
    sdk.create.mockResolvedValue(
      (async function* () {
        for (const part of [
          json.slice(0, 18),
          json.slice(18, 26),
          json.slice(26),
        ]) {
          yield { type: 'response.output_text.delta', delta: part };
        }
        yield {
          type: 'response.completed',
          response: {
            model: 'gpt-6-luna',
            output: [
              {
                type: 'message',
                content: [{ type: 'output_text', text: json }],
              },
            ],
          },
        };
      })(),
    );
    const deltas: string[] = [];
    const result = await explainPdf(input(), (delta) => deltas.push(delta));
    expect(deltas.join('')).toBe(output().answer);
    expect(result.sourceBlocks).toEqual([block]);
    expect(result.steps[0]?.explanation).toBe('Conceito explicado.');
    expect(sdk.create).toHaveBeenCalledTimes(1);
    expect(sdk.create.mock.calls[0]?.[0]).toMatchObject({
      store: false,
      stream: true,
      tools: [],
      text: { format: { type: 'json_schema', strict: true } },
    });
  });
  it('preserves every structured step and diagram in the compatible export layout', () => {
    const steps = ['Primeiro conceito.', 'Segundo conceito.'].map(
      (explanation, index) => ({
        lineId: `line-${index}`,
        explanation,
        basis: 'source' as const,
        citedBlockIds: [block.id],
        diagram: {
          layout: 'flow' as const,
          nodes: [`Causa ${index}`, `Efeito ${index}`],
          edges: [{ from: 0, to: 1, label: null }],
        },
      }),
    );
    const result = applyTutorPlan(
      { pages: [original], annotations: [] },
      original.id,
      null,
      { ...output(), steps, sourceBlocks: [block], sourceLines: [] },
      randomUUID(),
    );
    expect(validateStudyState(result.state, [original])).toBeNull();
    const text = result.state.annotations
      .map((annotation) => annotation.text)
      .join('\n');
    for (const [index, step] of steps.entries()) {
      expect(text).toContain(step.explanation);
      expect(text).toContain(`Causa ${index}`);
      expect(text).toContain(`Efeito ${index}`);
    }
    expect(
      result.state.annotations.filter(
        (annotation) => annotation.kind === 'arrow',
      ),
    ).toHaveLength(2);
  });
  it('does not commit partial model output and has an explicit demo', async () => {
    sdk.create.mockResolvedValue(
      (async function* () {
        yield {
          type: 'response.output_text.delta',
          delta: '{"answer":"parcial',
        };
        yield { type: 'response.incomplete' };
      })(),
    );
    await expect(explainPdf(input(), () => {})).rejects.toThrow(
      'AI_OUTPUT_INCOMPLETE',
    );
    const demoInput = input();
    demoInput.config.aiProvider = 'fake';
    const demo = await explainPdf(demoInput, () => {});
    expect(demo.basis).toBe('unsupported');
    expect(demo.answer).toContain('Modo de demonstração');
    expect(demo.citedBlockIds).toEqual([]);
    expect(sdk.create).toHaveBeenCalledTimes(1);
  });
  it('keeps visual scan citations without covering the whole source page', () => {
    const visual = {
      id: `${original.id}:visual`,
      text: 'Página digitalizada',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
    const visualPlan = validateTutorPlan(
      {
        ...output(),
        citedBlockIds: [visual.id],
        steps: [{ ...output().steps[0]!, citedBlockIds: [visual.id] }],
      },
      [visual],
    );
    const result = applyTutorPlan(
      { pages: [original], annotations: [] },
      original.id,
      null,
      visualPlan,
      randomUUID(),
    );
    expect(
      result.state.annotations.every(
        (annotation) => annotation.pageId !== original.id,
      ),
    ).toBe(true);
    expect(validateStudyState(result.state, [original])).toBeNull();
  });
  it('rejects cancelled and over-budget requests before using the provider', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      explainPdf(input(), () => {}, controller.signal),
    ).rejects.toThrow();
    const oversized = input();
    oversized.config.aiMaxInputChars = 10;
    await expect(explainPdf(oversized, () => {})).rejects.toThrow(
      'AI_INPUT_BUDGET_EXCEEDED',
    );
    expect(sdk.create).not.toHaveBeenCalled();
  });
  it('uses the chat model when the optional PDF model environment field is blank', async () => {
    vi.stubEnv('OPENAI_PDF_TUTOR_MODEL', '  ');
    vi.stubEnv('OPENAI_CHAT_MODEL', 'gpt-6-luna');
    sdk.create.mockResolvedValue(
      (async function* () {
        yield {
          type: 'response.completed',
          response: {
            model: 'gpt-6-luna',
            output: [
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify(streamedOutput()),
                  },
                ],
              },
            ],
          },
        };
      })(),
    );
    try {
      await explainPdf(input(), () => {});
      expect(sdk.create.mock.calls[0]?.[0]).toMatchObject({
        model: 'gpt-6-luna',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
