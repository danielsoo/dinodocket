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

export async function chat(messages: ChatMsg[], opts: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {}) {
  const c = llmConfig();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45000);
  try {
    const res = await fetch(`${c.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify({
        model: c.model,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 1200,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return String(data?.choices?.[0]?.message?.content ?? "");
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the first JSON object out of a model reply (handles <think> blocks and code fences). */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(cleaned.slice(start, end + 1));
}
