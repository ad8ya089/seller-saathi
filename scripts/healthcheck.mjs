try {
  const port = Number(process.env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error('Invalid port');
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    signal: AbortSignal.timeout(3000),
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true) process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
