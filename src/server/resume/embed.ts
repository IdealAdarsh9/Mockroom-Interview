import { env } from "../env";

export const LOCAL_MODEL = "local-hash-256-v1";
const DIMS = 256;

const STOP = new Set(
  "a an and are as at be but by for from has have in into is it its of on or that the their this to was were will with you your we our i my me they them he she his her not no so if than then these those over under about across per via using used use".split(" "),
);

export const tokenize = (text: string): string[] =>
  (text.toLowerCase().match(/[a-z0-9+#.]{2,}/g) ?? []).map((t) => t.replace(/^\.+|\.+$/g, "")).filter((t) => t.length > 1 && !STOP.has(t));

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic feature-hashing embedding (unigrams + bigrams). Runs offline; swap for a hosted model in production. */
export function localEmbed(text: string): Float32Array {
  const v = new Float32Array(DIMS);
  const toks = tokenize(text);
  const tf = new Map<string, number>();
  for (let i = 0; i < toks.length; i++) {
    tf.set(toks[i], (tf.get(toks[i]) ?? 0) + 1);
    if (i + 1 < toks.length) tf.set(toks[i] + "_" + toks[i + 1], (tf.get(toks[i] + "_" + toks[i + 1]) ?? 0) + 0.5);
  }
  for (const [t, c] of tf) {
    const h = fnv(t);
    v[h % DIMS] += (h & 0x80000000 ? -1 : 1) * (1 + Math.log(c));
  }
  return normalizeVec(v);
}

function normalizeVec(v: Float32Array) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export const toBlob = (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
export const fromBlob = (b: Buffer) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

export type Embedder = { model: string; embed(texts: string[]): Promise<Float32Array[]> };

export function getEmbedder(): Embedder {
  if (env.embeddingProvider === "openai" && env.providerKey("openai")) {
    const model = env.embeddingModel;
    return {
      model: `openai:${model}`,
      async embed(texts) {
        const res = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${env.providerKey("openai")}` },
          body: JSON.stringify({ model, input: texts }),
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) throw new Error(`embedding_http_${res.status}`);
        const data = (await res.json()) as { data: { embedding: number[] }[] };
        return data.data.map((d) => normalizeVec(Float32Array.from(d.embedding)));
      },
    };
  }
  return { model: LOCAL_MODEL, embed: async (texts) => texts.map(localEmbed) };
}

/** Query embedding must use the same model that produced the stored vectors. */
export async function embedQuery(query: string, model: string): Promise<Float32Array> {
  if (model === LOCAL_MODEL || !model.startsWith("openai:")) return localEmbed(query);
  const e = getEmbedder();
  return e.model === model ? (await e.embed([query]))[0] : localEmbed(query);
}
