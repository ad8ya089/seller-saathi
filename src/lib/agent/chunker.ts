export function speakableText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|[-+>]\s+|\d+[.)]\s+)/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/₹/g, 'rupees ')
    .replace(/%/g, ' percent')
    .replace(/\s+/g, ' ')
    .trim();
}

export class SentenceChunker {
  private buffer = '';
  private first = true;
  constructor(
    private readonly minFirstChars = 20,
    private readonly maxClauseChars = 140,
  ) {}

  push(fragment: string): string[] {
    this.buffer += fragment;
    return this.drain(false);
  }
  flush(): string[] {
    return this.drain(true);
  }

  private boundary(final: boolean): number | null {
    for (let index = 0; index < this.buffer.length; index += 1) {
      const character = this.buffer[index];
      const next = this.buffer[index + 1];
      if (character === undefined || !'.?!।'.includes(character)) continue;
      if (next === undefined ? !final : !/\s/.test(next)) continue;
      const length = index + 1;
      if (
        !this.first ||
        speakableText(this.buffer.slice(0, length)).length >= this.minFirstChars
      )
        return length;
    }
    return null;
  }

  private clauseBoundary(): number {
    const prefix = this.buffer.slice(0, this.maxClauseChars);
    const separators = [...prefix.matchAll(/[,;](?=\s)|\s+and\s+/g)];
    const last = separators.at(-1);
    if (last?.index !== undefined && last.index >= this.minFirstChars)
      return last.index + (last[0].trim() === 'and' ? 0 : 1);
    const space = prefix.lastIndexOf(' ');
    return space >= this.minFirstChars ? space : this.maxClauseChars;
  }

  private drain(final: boolean): string[] {
    const chunks: string[] = [];
    while (this.buffer) {
      const sentence = this.boundary(final);
      let end: number;
      if (sentence !== null && sentence <= this.maxClauseChars) end = sentence;
      else if (this.buffer.length > this.maxClauseChars)
        end = this.clauseBoundary();
      else if (sentence !== null) end = sentence;
      else if (final) end = this.buffer.length;
      else break;
      const chunk = speakableText(this.buffer.slice(0, end));
      this.buffer = this.buffer.slice(end).trimStart();
      if (chunk) {
        chunks.push(chunk);
        this.first = false;
      }
    }
    return chunks;
  }
}
