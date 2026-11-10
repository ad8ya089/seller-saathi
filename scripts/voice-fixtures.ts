import { validateWav } from '@/lib/voice/wav';

export const VOICE_TEXTS = [
  'My sales dropped this month. Can you help me understand what is happening?',
  'I sell kurti sets and sarees. My orders have fallen quite a lot.',
  'My sales were two lakh rupees earlier. Now they are much lower.',
  'The supplier is late this week, and my best sellers have no stock.',
  'Customers want the cotton kurti set. I cannot dispatch it without fresh stock.',
  'My printed saree is out of stock. The supplier needs ten more days.',
  'I have some stock in the shop, but my panel inventory looks wrong.',
  'Orders are down. I am worried about cancellations and delayed courier pickup.',
  'Should I change my prices, or focus on the products already in stock?',
  'The kurti sells well normally. This month I could not replenish it.',
  'I do not know why customers cancel. Can you check the reasons?',
  'My supplier promised delivery soon. Can we discuss a partial stock order?',
  'I see fewer orders for the saree. The other products are still selling.',
  'We pack on time, but sometimes the courier does not collect the parcels.',
  'I want to improve sales. Please review my stock and dispatch numbers.',
  'The shop needs working capital. I cannot restock all the best sellers today.',
  'I can arrange a small batch of cotton kurti sets later this week.',
  'One lakh rupees is a lot for my shop. Please help me plan carefully.',
  'I checked the panel yesterday. Some listings still show stock that is unavailable.',
  'Sales are falling, and I need a practical recovery plan for this week.',
] as const;

export function pcm16k(source: Buffer): Buffer {
  const info = validateWav(source, {
    sampleRates: [24000],
    maxBytes: 6000000,
    maxDurationMs: 120000,
  });
  const length = Math.floor(((info.dataBytes / 2) * 16000) / info.sampleRate);
  const output = Buffer.alloc(44 + length * 2);
  output.write('RIFF', 0);
  output.writeUInt32LE(output.length - 8, 4);
  output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(16000, 24);
  output.writeUInt32LE(32000, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36);
  output.writeUInt32LE(length * 2, 40);
  for (let index = 0; index < length; index += 1) {
    const position = (index * info.sampleRate) / 16000;
    const left = Math.floor(position);
    const right = Math.min(left + 1, info.dataBytes / 2 - 1);
    const value =
      source.readInt16LE(info.dataOffset + left * 2) * (1 - (position - left)) +
      source.readInt16LE(info.dataOffset + right * 2) * (position - left);
    output.writeInt16LE(Math.round(value), 44 + index * 2);
  }
  validateWav(output);
  return output;
}
