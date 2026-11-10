import { expect, test } from 'vitest';
import nextConfig from '../next.config';

test('production output is standalone without suppressing type errors', () => {
  expect(nextConfig.output).toBe('standalone');
  expect(nextConfig.typescript?.ignoreBuildErrors).not.toBe(true);
});
