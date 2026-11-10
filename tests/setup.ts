import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockRejectedValue(
        new Error('Live network calls are forbidden in automated tests'),
      ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
