// Meaning-vectors for semantic search.
//   - Gemini: real embeddings when GEMINI_API_KEY is set (model stored per vector).
//   - offline: a deterministic hashing embedding, so search still ranks by meaning
//     overlap without any network or key. Good enough for development and tests;
//     the research runs should use the Gemini embedder.
import crypto from "node:crypto";
import { tokenize } from "./text.js";

export const OFFLINE_MODEL = "offline-hash-256";
export const GEMINI_EMBED_MODEL = "gemini-embedding-001";
const OFFLINE_DIMS = 256;

function normalize(vec) {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum) || 1;
  return vec.map((v) => v / norm);
}

/** Hash one token to a dimension and sign (stable across runs). */
function hashToken(token) {
  const h = crypto.createHash("md5").update(token).digest();
  const dim = ((h[0] << 8) | h[1]) % OFFLINE_DIMS;
  const sign = h[2] & 1 ? 1 : -1;
  return { dim, sign };
}

/** Offline embedding: a normalised bag-of-token-hashes. Captures word overlap. */
export function offlineEmbed(text) {
  const vec = new Array(OFFLINE_DIMS).fill(0);
  for (const tok of tokenize(text)) {
    const { dim, sign } = hashToken(tok);
    vec[dim] += sign;
  }
  return normalize(vec);
}

export function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i += 1) dot += a[i] * b[i];
  return dot; // inputs are unit vectors
}

/**
 * Returns an embedder: { model, dims, embed(text) -> Promise<number[]>, embedBatch(texts) }.
 * Uses Gemini when apiKey is given, otherwise the offline embedder.
 */
export function createEmbedder({ apiKey = process.env.GEMINI_API_KEY, geminiEmbed } = {}) {
  if (!apiKey && !geminiEmbed) {
    return {
      model: OFFLINE_MODEL,
      dims: OFFLINE_DIMS,
      online: false,
      async embed(text) {
        return offlineEmbed(text);
      },
      async embedBatch(texts) {
        return texts.map(offlineEmbed);
      },
    };
  }
  const embedOne =
    geminiEmbed ??
    (async (text) => {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      const res = await ai.models.embedContent({ model: GEMINI_EMBED_MODEL, contents: text, config: { outputDimensionality: 768 } });
      return normalize(res.embeddings[0].values);
    });
  return {
    model: GEMINI_EMBED_MODEL,
    dims: 768,
    online: true,
    async embed(text) {
      return embedOne(text);
    },
    async embedBatch(texts) {
      const out = [];
      for (const t of texts) out.push(await embedOne(t)); // sequential: gentle on rate limits
      return out;
    },
  };
}
