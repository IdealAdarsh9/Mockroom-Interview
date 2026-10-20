import { q } from "../db";
import { decryptSecret } from "../crypto";
import { env } from "../env";
import { MockSpeechToText, MockTextToSpeech } from "./mock";
import { OpenAISpeechToText } from "./openai";
import type { SpeechToText } from "./types";

/** Uses real transcription only when the admin enabled OpenAI for candidate data and a key exists; otherwise the labelled mock. */
export function getSpeechToText(): SpeechToText {
  const r = q.get<{ enabled: number; candidate_data_ok: number; api_key_enc: string | null }>("SELECT enabled, candidate_data_ok, api_key_enc FROM provider_configurations WHERE id = 'openai'");
  const key = (r?.api_key_enc && decryptSecret(r.api_key_enc)) || env.providerKey("openai");
  if (r?.enabled && r.candidate_data_ok && key) return new OpenAISpeechToText(key);
  return new MockSpeechToText();
}
export const getTextToSpeech = () => new MockTextToSpeech();
