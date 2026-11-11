// Controlled transport probe, never copied into the production image.
import { createServer } from 'node:http';
createServer(async (request, response) => {
  if (request.url === '/api/turn') {
    const body = [];
    for await (const chunk of request) body.push(chunk);
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    response.write(
      'event: transcript\ndata: ' +
        JSON.stringify({
          method: request.method,
          body: Buffer.concat(body).toString(),
          proxyVerified:
            request.headers['x-internal-proxy-token'] ===
            process.env.TRUSTED_PROXY_TOKEN,
          peerOverwritten: request.headers['x-real-ip'] !== '203.0.113.77',
          compressionDisabled:
            request.headers['accept-encoding'] === 'identity',
        }) +
        '\n\n',
    );
    setTimeout(
      () =>
        response.write(
          'event: sentence\ndata: {"text":"Synthetic transport probe."}\n\n',
        ),
      700,
    );
    setTimeout(() => response.end('event: done\ndata: {}\n\n'), 1400);
  } else {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"ok":true,"syntheticTransportOnly":true}');
  }
}).listen(3000, '0.0.0.0');
