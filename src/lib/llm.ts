// Minimal OpenAI-compatible client (Luminal Cloud exposes an OpenAI-compatible API).
// Configure with env vars; without a key the app falls back to deterministic mock behavior.

export const llmConfig = () => ({
  apiKey: process.env.LUMINAL_API_KEY ?? "",
  baseUrl: (process.env.LUMINAL_BASE_URL || "https://flash.luminal.cloud/v1").replace(/\/+$/, ""),
  model: process.env.LUMINAL_MODEL || "deepseek-ai/DeepSeek-V4.1-Flash",
});

export const llmEnabled = () => {
  const c = llmConfig();
  return Boolean(c.apiKey && c.baseUrl);
};

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  text: string; // answer text to parse (content, or reasoning text if content is empty)
  diag: string; // short diagnostics for error messages
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export class LlmError extends Error {
  constructor(message: string, public attempts: number) {
    super(message);
  }
}

/**
 * One chat completion with retries. Transient errors (503 "temporarily unavailable", 429, timeouts)
 * are retried with exponential backoff and jitter until the overall time budget runs out.
 */
export async function chat(
  messages: ChatMsg[],
  opts: { temperature?: number; maxTokens?: number; budgetMs?: number; models?: string[] } = {},
): Promise<ChatResult & { attempts: number; model: string }> {
  const c = llmConfig();
  const models = opts.models ?? [c.model, ...(process.env.LUMINAL_FALLBACK_MODEL ? [process.env.LUMINAL_FALLBACK_MODEL] : [])];
  const deadline = Date.now() + (opts.budgetMs ?? 95000);
  let attempt = 0;
  let lastErr = "";
  while (Date.now() < deadline - 3000) {
    const model = models[attempt % models.length];
    attempt++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.max(5000, Math.min(70000, deadline - Date.now())));
    try {
      const res = await fetch(`${c.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.apiKey}` },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? 0.7,
          // Reasoning models spend tokens thinking before answering; leave plenty of room.
          max_tokens: opts.maxTokens ?? 6000,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        lastErr = `LLM ${res.status}: ${(await res.text()).slice(0, 160)}`;
        if (!RETRYABLE.has(res.status)) throw new LlmError(lastErr, attempt);
      } else {
        const data = await res.json();
        const choice = data?.choices?.[0] ?? {};
        const msg = choice.message ?? {};
        const content = typeof msg.content === "string" ? msg.content : "";
        const reasoning = String(msg.reasoning_content ?? msg.reasoning ?? "");
        const diag = `finish=${choice.finish_reason ?? "?"} content=${content.length}ch reasoning=${reasoning.length}ch head="${content.slice(0, 60).replace(/\s+/g, " ")}"`;
        // Prefer the answer; fall back to the reasoning text if the answer is empty or has no JSON.
        const text = content.includes("{") ? content : `${content}\n${reasoning}`;
        return { text, diag, attempts: attempt, model };
      }
    } catch (e) {
      if (e instanceof LlmError) throw e;
      lastErr = e instanceof Error && e.name === "AbortError" ? "LLM request timed out" : `LLM network error: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      clearTimeout(timer);
    }
    // Backoff: ~1.5s, 3s, 6s, 10s (capped), with jitter so parallel agents don't retry in lockstep.
    const wait = Math.min(10000, 1500 * 2 ** (attempt - 1)) * (0.6 + Math.random() * 0.8);
    if (Date.now() + wait > deadline - 3000) break;
    await sleep(wait);
  }
  throw new LlmError(`${lastErr || "LLM unavailable"} (after ${attempt} attempts)`, attempt);
}

/**
 * Find a JSON object in a model reply. Handles <think> blocks (closed or truncated), code fences,
 * prose around the JSON, and several candidate objects: returns the last one that parses and has
 * one of the wanted keys.
 */
export function extractJson(text: string, wantKeys: string[] = [], diag = ""): unknown {
  let t = text.replace(/```(?:json)?/g, "");
  const closeIdx = t.lastIndexOf("</think>");
  if (closeIdx >= 0) {
    const after = t.slice(closeIdx + 8);
    if (after.includes("{")) t = after; // the answer after thinking wins when it has JSON
  }
  const found: unknown[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== "{") continue;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < t.length; j++) {
      const ch = t[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try {
          const obj = JSON.parse(t.slice(i, j + 1));
          if (obj && typeof obj === "object") {
            found.push(obj);
            i = j; // skip nested objects: we want the outer {"rationale", "strategy"}, not the inner strategy
          }
        } catch {}
        break;
      }
    }
  }
  // Earlier keys in wantKeys are preferred: an object with "strategy" beats a bare strategy object.
  for (const k of wantKeys) {
    const hit = found.filter((o) => k in (o as Record<string, unknown>));
    if (hit.length) return hit[hit.length - 1];
  }
  if (!wantKeys.length && found.length) return found[found.length - 1];
  throw new Error(`No JSON object in model output (${diag})`);
}
