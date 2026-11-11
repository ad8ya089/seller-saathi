// Local diagnostic only. Copies into its own keyless container, never the image.
import { resourceUsage, memoryUsage } from 'node:process';

const marks = [];
const mark = (stage) =>
  marks.push({ stage, utc: new Date().toISOString(), ms: performance.now() });
mark('module-entry');
if (process.argv[2] !== 'node-only') {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    mark('fetch-enter');
    args[1]?.signal?.addEventListener('abort', () => mark('signal-abort'), {
      once: true,
    });
    const pending = originalFetch(...args);
    mark('fetch-return');
    return pending.then(
      (response) => {
        mark('headers');
        const json = response.json.bind(response);
        response.json = async () => {
          const body = await json();
          mark('body');
          return body;
        };
        return response;
      },
      (error) => {
        mark(`fetch-error-${error.name}`);
        throw error;
      },
    );
  };
  await import('/app/scripts/healthcheck.mjs');
}
mark('module-end');
console.log(
  JSON.stringify({
    marks,
    exitCode: process.exitCode ?? 0,
    usage: resourceUsage(),
    rss: memoryUsage().rss,
  }),
);
