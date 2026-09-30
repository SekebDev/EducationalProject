import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';

export type ExtractedLocation =
  | { kind: 'page'; number: number }
  | { kind: 'paragraph'; number: number }
  | { kind: 'line'; number: number };

export type ExtractedSegment = {
  text: string;
  locator: ExtractedLocation;
};

export class ExtractionError extends Error {
  readonly retryable = false;

  constructor(readonly code: string) {
    super(code);
  }
}

const maxTextCharacters = 2_000_000;

function ensureContent(segments: ExtractedSegment[]): ExtractedSegment[] {
  const content = segments.filter((segment) => segment.text.trim());
  if (content.length === 0) {
    throw new ExtractionError('MATERIAL_NO_TEXT');
  }
  if (
    content.reduce((size, segment) => size + segment.text.length, 0) >
    maxTextCharacters
  ) {
    throw new ExtractionError('MATERIAL_TEXT_TOO_LARGE');
  }
  return content;
}

function extractTxt(data: Uint8Array): ExtractedSegment[] {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    throw new ExtractionError('MATERIAL_INVALID_UTF8');
  }
  return ensureContent(
    decoded
      .replace(/^\uFEFF/u, '')
      .split(/\r\n|\n|\r/u)
      .map((text, index) => ({
        text,
        locator: { kind: 'line', number: index + 1 },
      })),
  );
}

async function extractDocx(data: Uint8Array): Promise<ExtractedSegment[]> {
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    return ensureContent(
      result.value.split(/\n\n/u).map((text, index) => ({
        text: text.trim(),
        locator: { kind: 'paragraph', number: index + 1 },
      })),
    );
  } catch (error) {
    if (error instanceof ExtractionError) {
      throw error;
    }
    throw new ExtractionError('MATERIAL_DOCX_UNREADABLE');
  }
}

async function extractPdf(data: Uint8Array): Promise<ExtractedSegment[]> {
  const task = getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    disableFontFace: true,
  });
  try {
    const document = await task.promise;
    const segments: ExtractedSegment[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' ')
        .trim();
      segments.push({ text, locator: { kind: 'page', number: pageNumber } });
      page.cleanup();
    }
    return ensureContent(segments);
  } catch (error) {
    if (error instanceof ExtractionError) {
      throw error;
    }
    const name = error instanceof Error ? error.name : '';
    throw new ExtractionError(
      name === 'PasswordException'
        ? 'MATERIAL_PDF_PROTECTED'
        : 'MATERIAL_PDF_UNREADABLE',
    );
  } finally {
    await task.destroy();
  }
}

export async function extractMaterial(
  mime:
    | 'application/pdf'
    | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    | 'text/plain',
  data: Uint8Array,
): Promise<ExtractedSegment[]> {
  if (data.byteLength === 0 || data.byteLength > 20_000_000) {
    throw new ExtractionError('MATERIAL_SIZE_INVALID');
  }
  if (mime === 'text/plain') {
    return extractTxt(data);
  }
  if (mime === 'application/pdf') {
    return extractPdf(data);
  }
  return extractDocx(data);
}
