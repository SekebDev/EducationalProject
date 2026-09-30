import { apiErrorSchema } from '@study/contracts';
import type { ApiError } from '@study/contracts';

type ResponseSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};

export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;

async function csrf(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }
  const response = await fetch('/api/v1/auth/csrf', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new RequestError(
      response.status,
      'CSRF_FAILED',
      'Não foi possível iniciar a sessão.',
    );
  }
  const body = (await response.json()) as { token: string };
  csrfToken = body.token;
  return body.token;
}

async function responseError(response: Response): Promise<RequestError> {
  const parsed = apiErrorSchema.safeParse(
    await response.json().catch(() => null),
  );
  const data: ApiError | null = parsed.success ? parsed.data : null;
  if (response.status === 403 && data?.error.code === 'CSRF_INVALID') {
    csrfToken = null;
  }
  return new RequestError(
    response.status,
    data?.error.code ?? 'REQUEST_FAILED',
    data?.error.message ?? 'Não foi possível concluir a solicitação.',
  );
}

function parseResponse<T>(
  value: unknown,
  response: Response,
  schema?: ResponseSchema<T>,
): T {
  if (!schema) {
    return value as T;
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new RequestError(
      response.status,
      'INVALID_RESPONSE',
      'O servidor retornou uma resposta inválida.',
    );
  }
  return parsed.data;
}

export async function api<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    idempotent?: boolean;
    signal?: AbortSignal;
    responseSchema?: ResponseSchema<T>;
  } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers = new Headers();
  if (method !== 'GET') {
    headers.set('X-CSRF-Token', await csrf());
    if (options.idempotent) {
      headers.set('Idempotency-Key', crypto.randomUUID());
    }
  }
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      ...(options.body === undefined
        ? {}
        : {
            body:
              options.body instanceof FormData
                ? options.body
                : JSON.stringify(options.body),
          }),
      credentials: 'same-origin',
      cache: 'no-store',
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    throw new RequestError(
      0,
      'NETWORK_ERROR',
      'Não foi possível conectar. Verifique a rede e tente novamente.',
    );
  }
  if (!response.ok) {
    throw await responseError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const body = await response.text();
  if (!body) {
    return undefined as T;
  }
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new RequestError(
      response.status,
      'INVALID_RESPONSE',
      'O servidor retornou uma resposta inválida.',
    );
  }
  return parseResponse(value, response, options.responseSchema);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Ocorreu um erro. Tente novamente.';
}
