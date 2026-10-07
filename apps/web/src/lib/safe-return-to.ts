export function safeReturnTo(requested: string | null, origin: string): string {
  if (!requested?.startsWith('/') || /[\\\u0000-\u0020\u007f]/u.test(requested)) {
    return '/conversas';
  }
  try {
    const url = new URL(requested, origin);
    if (url.origin !== origin) return '/conversas';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/conversas';
  }
}
