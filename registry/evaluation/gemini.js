// A Gemini caller that counts what it uses (calls, tokens, retries) so the
// evaluation can report AI cost per site. One instance per measured run, so the
// numbers belong to exactly that run.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BUSY = /503|UNAVAILABLE|overloaded|high demand/i;
const QUOTA = /exceeded your current quota|RESOURCE_EXHAUSTED|"code":\s*429|\b429\b/i;

/** True when an error (or its text) means "Gemini could not be used", not "the system under test failed". */
export const isGeminiUnavailable = (e) => QUOTA.test(String(e?.message ?? e)) || Boolean(e?.quota) || /API key not valid|PERMISSION_DENIED/i.test(String(e?.message ?? e));

export function createMeteredGemini({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || "gemini-2.5-flash", retries = 5, quotaWaitMs = 15000, generate } = {}) {
  const usage = { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, retries: 0, ms: 0 };
  let ai;

  // `generate` can be injected so tests never touch the network.
  const call =
    generate ||
    (async (prompt, config) => {
      if (!ai) {
        const { GoogleGenAI } = await import("@google/genai");
        ai = new GoogleGenAI({ apiKey });
      }
      const res = await ai.models.generateContent({ model, contents: prompt, config });
      return { text: res.text ?? "", usage: res.usageMetadata };
    });

  async function run(prompt, config) {
    for (let attempt = 0; ; attempt += 1) {
      const started = Date.now();
      try {
        const out = await call(prompt, config);
        usage.calls += 1;
        usage.ms += Date.now() - started;
        const u = out.usage || {};
        usage.inputTokens += u.promptTokenCount ?? 0;
        usage.outputTokens += (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
        usage.totalTokens += u.totalTokenCount ?? (u.promptTokenCount ?? 0) + (u.candidatesTokenCount ?? 0);
        return out.text;
      } catch (e) {
        const text = String(e?.message ?? e);
        if (QUOTA.test(text)) {
          // A used-up quota will not come back in a few seconds: try once more, then stop and say so.
          if (attempt < 1) {
            usage.retries += 1;
            await sleep(quotaWaitMs);
            continue;
          }
          throw Object.assign(new Error(`Gemini quota exhausted: ${text.slice(0, 160)}`), { quota: true });
        }
        if (attempt < retries && BUSY.test(text)) {
          usage.retries += 1;
          await sleep(1500 * 2 ** attempt);
          continue;
        }
        throw e;
      }
    }
  }

  return {
    model,
    usage,
    /** For the planner: answers JSON text. */
    callJson: (prompt) => run(prompt, { responseMimeType: "application/json" }),
    /** For code generation: answers free text. */
    callText: (prompt) => run(prompt, {}),
  };
}
