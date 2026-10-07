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
const accountEpochKey = 'study-account-epoch';
let memoryEpoch = 'initial';
let listening = false;

function accountEpoch(): string {
  if (typeof window === 'undefined') {
    return memoryEpoch;
  }
  if (!listening) {
    listening = true;
    window.addEventListener('storage', (event) => {
      if (event.key === accountEpochKey) {
        csrfToken = null;
        // Reload clears private component state and cancels streams in other tabs.
        if (
          !['/entrar', '/cadastro', '/recuperar-senha', '/'].includes(
            window.location.pathname,
          )
        ) {
          window.location.replace('/entrar?expired=1');
        }
      }
    });
  }
  try {
    return window.localStorage.getItem(accountEpochKey) ?? memoryEpoch;
  } catch {
    return memoryEpoch;
  }
}

function invalidateAccount(): void {
  memoryEpoch = crypto.randomUUID();
  csrfToken = null;
  try {
    window.localStorage.setItem(accountEpochKey, memoryEpoch);
  } catch {
    /* Storage can be unavailable. */
  }
}

function assertAccount(epoch: string): void {
  if (accountEpoch() !== epoch) {
    throw new RequestError(
      401,
      'ACCOUNT_CHANGED',
      'A conta mudou. Entre novamente para continuar.',
    );
  }
}

async function csrf(): Promise<string> {
  const epoch = accountEpoch();
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
  assertAccount(epoch);
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
    idempotencyKey?: string;
    signal?: AbortSignal;
    responseSchema?: ResponseSchema<T>;
  } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const changesAccount =
    method === 'POST' &&
    [
      '/auth/login',
      '/auth/register',
      '/auth/logout',
      '/auth/password-reset/confirm',
    ].includes(path);
  if (changesAccount) {
    invalidateAccount();
  }
  const epoch = accountEpoch();
  const headers = new Headers();
  if (method !== 'GET') {
    headers.set('X-CSRF-Token', await csrf());
    if (options.idempotent || options.idempotencyKey) {
      headers.set(
        'Idempotency-Key',
        options.idempotencyKey ?? crypto.randomUUID(),
      );
    }
  }
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  assertAccount(epoch);
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
  assertAccount(epoch);
  if (!response.ok) {
    throw await responseError(response);
  }
  if (changesAccount) {
    invalidateAccount();
  }
  const responseEpoch = accountEpoch();
  if (response.status === 204) {
    return undefined as T;
  }
  const body = await response.text();
  assertAccount(responseEpoch);
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

export async function apiBlob(path: string): Promise<Blob> {
  const epoch = accountEpoch();
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  assertAccount(epoch);
  if (!response.ok) {
    throw await responseError(response);
  }
  const blob = await response.blob();
  assertAccount(epoch);
  return blob;
}

export async function apiStream<T>(
  path: string,
  body: unknown,
  onEvent: (event: T) => void,
  signal: AbortSignal,
): Promise<void> {
  const epoch = accountEpoch();
  const token = await csrf();
  assertAccount(epoch);
  const response = await fetch(`/api/v1${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
    },
    body: JSON.stringify(body),
  });
  assertAccount(epoch);
  if (!response.ok) {
    throw await responseError(response);
  }
  if (!response.body) {
    throw new Error('O servidor não iniciou a explicação.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      assertAccount(epoch);
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) {
          assertAccount(epoch);
          onEvent(JSON.parse(line) as T);
        }
      }
      if (done) {
        break;
      }
    }
    if (pending.trim()) {
      assertAccount(epoch);
      onEvent(JSON.parse(pending) as T);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
