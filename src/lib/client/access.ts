let accessCode = '';
export function setAccessCode(code: string): void {
  accessCode = code;
}
export function withAccess(headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  if (accessCode) result.set('x-demo-access-code', accessCode);
  return result;
}
