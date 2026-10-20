import type { SpeechToText, TextToSpeech } from "./types";

/** Deterministic stand-in so the voice path can be exercised without credentials. Output is labelled mock everywhere it is shown. */
export class MockSpeechToText implements SpeechToText {
  readonly id = "mock-stt";
  async transcribe(audio: Buffer): Promise<{ text: string; provider: string; mock: boolean }> {
    if (audio.length < 16) return { text: "", provider: this.id, mock: true };
    return { text: "This is a simulated transcript from the demo speech adapter. Edit it to say what you meant.", provider: this.id, mock: true };
  }
}

/** Generates a short, quiet 16-bit PCM WAV whose length follows the text, so playback states can be tested. */
export class MockTextToSpeech implements TextToSpeech {
  readonly id = "mock-tts";
  async synthesize(text: string, opts: { rate?: number } = {}) {
    const rate = Math.min(2, Math.max(0.5, opts.rate ?? 1));
    const seconds = Math.min(6, Math.max(0.4, (text.split(/\s+/).length * 0.3) / rate));
    const sampleRate = 8000;
    const n = Math.floor(seconds * sampleRate);
    const buf = Buffer.alloc(44 + n * 2);
    buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28);
    buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 300), 44 + i * 2);
    return { audio: buf, mime: "audio/wav" };
  }
}
