export interface HttpHeader {
  key: string;
  value: string;
}
// Next's inline hydration and inline styles require unsafe-inline here.
// WASM compilation is allowed without enabling JavaScript unsafe-eval.
export const securityHeaders: HttpHeader[] = [
  { key: 'Permissions-Policy', value: 'microphone=(self), camera=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy',
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  },
];
export const vadHeaders: { source: string; headers: HttpHeader[] }[] = (
  [
    ['silero_vad_v6.onnx', 'application/octet-stream'],
    ['ort-wasm-simd-threaded.wasm', 'application/wasm'],
    ['ort-wasm-simd-threaded.mjs', 'text/javascript; charset=utf-8'],
    ['vad.worklet.bundle.min.js', 'text/javascript; charset=utf-8'],
  ] as const
).map(([name, type]) => ({
  source: `/vad/${name}`,
  headers: [{ key: 'Content-Type', value: type }],
}));
