/**
 * Groq client for Scarlet Oracle — OpenAI-compatible chat completions.
 *
 * Free-tier brain with Llama 3.3 70B: smarter than the small flash models and
 * higher free rate limits, with native tool calling. The agent tool loop lives
 * in oracle-agent.ts (buffered, mirrors the other providers).
 */
import { fetchWithGuard, FetchGuardError, readTextCapped } from "@rutgers-gpt/shared/net";

export type GroqToolCall = {
  id: string;
  type?: "function";
  function: { name: string; arguments: string };
};

export type GroqMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
};

type GroqChatOk = { ok: true; message: GroqMessage };
type GroqChatResult = GroqChatOk | { ok: false; error: string };

export async function groqChatCompletion(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: GroqMessage[];
  tools?: unknown;
  temperature?: number;
  maxTokens?: number;
}): Promise<GroqChatResult> {
  const url = `${opts.baseUrl}/chat/completions`;
  const body = {
    model: opts.model,
    messages: opts.messages,
    ...(opts.tools ? { tools: opts.tools, tool_choice: "auto" } : {}),
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 2048,
  };

  try {
    const res = await fetchWithGuard(url, {
      label: "Groq",
      timeoutMs: 30_000,
      retries: 2,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const raw = await readTextCapped(res, 4_000_000, "Groq");

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(raw) as { error?: { message?: string } };
        if (j?.error?.message) msg = j.error.message;
      } catch {
        /* non-JSON error body */
      }
      return { ok: false, error: `Groq ${msg}` };
    }

    const json = JSON.parse(raw) as {
      choices?: { message?: GroqMessage }[];
    };
    const message = json.choices?.[0]?.message;
    if (!message) return { ok: false, error: "Groq returned no message" };
    return { ok: true, message };
  } catch (e) {
    if (e instanceof FetchGuardError) {
      return { ok: false, error: e.timedOut ? "Groq timed out" : e.message };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Groq request failed" };
  }
}
