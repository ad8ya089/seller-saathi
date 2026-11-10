interface WavFixtureOptions {
  sampleRate?: number;
  durationMs?: number;
  channels?: number;
  metadata?: boolean;
}

export function wavFixture(options: WavFixtureOptions = {}): Buffer {
  const sampleRate = options.sampleRate ?? 16000;
  const channels = options.channels ?? 1;
  const frames = Math.round((sampleRate * (options.durationMs ?? 100)) / 1000);
  const metadataSize = options.metadata ? 12 : 0;
  const dataSize = frames * channels * 2;
  const bytes = Buffer.alloc(44 + metadataSize + dataSize);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVE', 8);
  bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(channels, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * channels * 2, 28);
  bytes.writeUInt16LE(channels * 2, 32);
  bytes.writeUInt16LE(16, 34);
  if (options.metadata) {
    bytes.write('JUNK', 36);
    bytes.writeUInt32LE(3, 40);
    bytes.write('abc', 44);
  }
  bytes.write('data', 36 + metadataSize);
  bytes.writeUInt32LE(dataSize, 40 + metadataSize);
  return bytes;
}
