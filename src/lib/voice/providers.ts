export interface SttResult {
  attempts?: number;
  text: string;
  ms: number;
}
export interface TtsResult {
  attempts?: number;
  wav: Buffer;
  ms: number;
}
export interface SttProvider {
  transcribe(
    wav: Buffer,
    lang: string,
    signal?: AbortSignal,
  ): Promise<SttResult>;
}
export interface TtsProvider {
  synthesize(
    text: string,
    lang: string,
    signal?: AbortSignal,
  ): Promise<TtsResult>;
}
export interface VoiceProviders {
  stt: SttProvider;
  tts: TtsProvider;
}
