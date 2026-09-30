import busboy from 'busboy';
import type { Request } from 'express';
import { PublicError } from '../../infrastructure/http/public-error.js';

const maxBytes = 20_000_000;

export type UploadedMaterial = {
  name: string;
  bytes: Buffer;
  declaredMime: string;
};

export function readMaterialUpload(
  request: Request,
): Promise<UploadedMaterial> {
  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: request.headers,
        limits: { files: 2, fields: 1, parts: 2, fileSize: maxBytes + 1 },
      });
    } catch {
      reject(
        new PublicError(415, 'UPLOAD_INVALID', 'Envie um arquivo multipart.'),
      );
      return;
    }
    let uploaded: UploadedMaterial | undefined;
    let failure: PublicError | undefined;
    let fileCount = 0;
    parser.on('file', (_field, stream, info) => {
      fileCount += 1;
      if (fileCount > 1) {
        failure = new PublicError(
          422,
          'UPLOAD_INVALID',
          'Envie apenas um arquivo.',
        );
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size <= maxBytes) {
          chunks.push(chunk);
        }
      });
      stream.on('limit', () => {
        failure = new PublicError(
          413,
          'FILE_SIZE_INVALID',
          'Arquivo fora do limite de 20 MB.',
        );
      });
      stream.on('end', () => {
        if (size === 0) {
          failure = new PublicError(
            422,
            'FILE_SIZE_INVALID',
            'O arquivo está vazio.',
          );
        }
        if (fileCount === 1) {
          uploaded = {
            name: info.filename,
            declaredMime: info.mimeType,
            bytes: Buffer.concat(chunks),
          };
        }
      });
    });
    parser.on('field', () => {
      failure = new PublicError(
        422,
        'UPLOAD_INVALID',
        'O envio deve conter somente o arquivo.',
      );
    });
    parser.on('filesLimit', () => {
      failure = new PublicError(
        422,
        'UPLOAD_INVALID',
        'Envie apenas um arquivo.',
      );
    });
    parser.on('fieldsLimit', () => {
      failure = new PublicError(
        422,
        'UPLOAD_INVALID',
        'O envio deve conter somente o arquivo.',
      );
    });
    parser.on('partsLimit', () => {
      failure = new PublicError(
        422,
        'UPLOAD_INVALID',
        'Envie apenas um arquivo.',
      );
    });
    parser.on('error', () =>
      reject(new PublicError(422, 'UPLOAD_INVALID', 'Arquivo inválido.')),
    );
    parser.on('finish', () => {
      if (failure) {
        reject(failure);
      } else if (uploaded) {
        resolve(uploaded);
      } else {
        reject(new PublicError(422, 'UPLOAD_INVALID', 'Envie um arquivo.'));
      }
    });
    request.pipe(parser);
  });
}

function isUtf8Text(bytes: Uint8Array): boolean {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    for (const character of decoded) {
      const code = character.codePointAt(0) ?? 0;
      if ((code < 32 && ![9, 10, 13].includes(code)) || code === 127) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function detectMaterialMime(
  name: string,
  bytes: Uint8Array,
  declaredMime: string,
):
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'text/plain' {
  const extension = name
    .toLowerCase()
    .match(/\.(pdf|docx|txt|md|markdown)$/u)?.[1];
  const pdf = Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-';
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const docx =
    zip && Buffer.from(bytes).includes(Buffer.from('word/document.xml'));
  const text = !pdf && !zip && isUtf8Text(bytes);
  const markdown = extension === 'md' || extension === 'markdown';
  if (
    (extension === 'pdf' && pdf && declaredMime === 'application/pdf') ||
    (extension === 'docx' &&
      docx &&
      declaredMime ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document') ||
    ((extension === 'txt' || markdown) &&
      text &&
      [
        'text/plain',
        'application/octet-stream',
        ...(markdown ? ['text/markdown', 'text/x-markdown'] : []),
      ].includes(declaredMime))
  ) {
    return extension === 'pdf'
      ? 'application/pdf'
      : extension === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'text/plain';
  }
  throw new PublicError(
    415,
    'MATERIAL_FORMAT_INVALID',
    'Use um arquivo PDF, DOCX, TXT ou Markdown (.md) válido.',
  );
}
