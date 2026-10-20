import { AppError } from "../errors";
import type { SpeechToText, TranscribeResult } from "./types";

/** Whisper-compatible transcription. Only used when an OpenAI key is configured and the candidate has consented to AI processing. */
export class OpenAISpeechToText implements SpeechToText {
  readonly id = "openai-whisper";
  constructor(private apiKey: string, private timeoutMs = 30000) {}
  async transcribe(audio: Buffer, mime: string): Promise<TranscribeResult> {
    const form = new FormData();
    form.append("model", "whisper-1");
    form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), "answer.webm");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}` }, body: form, signal: ctrl.signal });
      if (res.status === 429) throw new AppError(429, "stt_rate_limited", "The speech service is busy. Try again in a moment, or type your answer.");
      if (!res.ok) throw new AppError(502, "stt_failed", "Speech transcription failed. You can type your answer instead.");
      const data = (await res.json()) as { text?: string };
      return { text: (data.text ?? "").trim(), provider: this.id, mock: false };
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(502, "stt_unreachable", "The speech service could not be reached. You can type your answer instead.");
    } finally {
      clearTimeout(t);
    }
  }
}
