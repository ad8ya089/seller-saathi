import { loadData } from '@/lib/server/data-loader';
import { verifyData } from '@/lib/domain/data-invariants';
import { AppError } from '@/lib/errors';

async function main(): Promise<void> {
  try {
    const results = verifyData(await loadData());
    for (const result of results) {
      console.log(
        `${result.ok ? 'PASS' : 'FAIL'} ${result.name}: ${String(result.actual)} (expected ${String(result.expected)})`,
      );
    }
    const failed = results.filter((result) => !result.ok).length;
    console.log(
      `${String(results.length - failed)}/${String(results.length)} data invariants passed.`,
    );
    if (failed > 0) process.exitCode = 1;
  } catch (error: unknown) {
    console.error(
      error instanceof AppError
        ? `${error.code}: ${error.message}`
        : 'DATA_INVALID: Data verification failed',
    );
    process.exitCode = 1;
  }
}

void main();
