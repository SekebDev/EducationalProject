export function safeReturnTo(requested: string | null, origin: string): string {
  if (
    !requested?.startsWith('/') ||
    Array.from(requested).some(
      (character) =>
        character === '\\' ||
        character.charCodeAt(0) <= 32 ||
        character.charCodeAt(0) === 127,
    )
  ) {
    return '/conversas';
  }
  try {
    const url = new URL(requested, origin);
    if (url.origin !== origin) {
      return '/conversas';
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/conversas';
  }
}
