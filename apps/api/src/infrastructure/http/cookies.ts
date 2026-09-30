import type { Request, Response } from 'express';

export function getCookie(request: Request, name: string): string | undefined {
  const part = request.headers.cookie
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  if (!part) {
    return undefined;
  }
  return decodeURIComponent(part.slice(name.length + 1));
}

export function setCookie(
  response: Response,
  name: string,
  value: string,
  options: { maxAgeSeconds: number; httpOnly: boolean; secure: boolean },
): void {
  const serialized = `${name}=${encodeURIComponent(value)}; Path=/api/v1; Max-Age=${options.maxAgeSeconds}; SameSite=Lax${options.httpOnly ? '; HttpOnly' : ''}${options.secure ? '; Secure' : ''}`;
  const previous = response.getHeader('Set-Cookie');
  response.setHeader('Set-Cookie', [
    ...(Array.isArray(previous)
      ? previous
      : previous
        ? [String(previous)]
        : []),
    serialized,
  ]);
}
