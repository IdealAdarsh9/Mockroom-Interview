/** Provider-agnostic speech contracts. Browser-side live recognition and synthesis are the defaults; these adapters cover server-side use. */
export type TranscribeResult = { text: string; confidence?: number; provider: string; mock: boolean };

export interface SpeechToText {
  readonly id: string;
  transcribe(audio: Buffer, mime: string): Promise<TranscribeResult>;
}

export interface TextToSpeech {
  readonly id: string;
  /** Returns audio bytes and their mime type. */
  synthesize(text: string, opts?: { rate?: number }): Promise<{ audio: Buffer; mime: string }>;
}
