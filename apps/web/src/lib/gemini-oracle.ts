/**
 * Google Gemini (Generative Language API) client for Scarlet Oracle.
 *
 * Free-tier brain: default model `gemini-2.5-flash`. Uses the REST
 * `:generateContent` endpoint with function calling. One call per agent round;
 * the tool loop lives in oracle-agent.ts (mirrors the Anthropic path — buffered,
 * not streamed, so the server can post-process the answer/confidence later).
 */
import { fetchWithGuard, FetchGuardError, readTextCapped } from "@rutgers-gpt/shared/net";

export type GeminiFunctionCall = { name: string; args?: Record<string, unknown> };

export type GeminiPart =
  | { text: string }
  | { functionCall: GeminiFunctionCall }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

type GeminiGenerateOk = {
  ok: true;
  content: GeminiContent | null;
  text: string;
  functionCalls: GeminiFunctionCall[];
};

type GeminiGenerateResult = GeminiGenerateOk | { ok: false; error: string };

export async function geminiGenerateContent(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemInstruction: string;
  contents: GeminiContent[];
  tools?: unknown;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<GeminiGenerateResult> {
  const url = `${opts.baseUrl}/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: opts.systemInstruction }] },
    contents: opts.contents,
    ...(opts.tools ? { tools: opts.tools } : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 2048,
    },
  };

  try {
    const res = await fetchWithGuard(url, {
      label: "Gemini",
      timeoutMs: 30_000,
      retries: 2,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": opts.apiKey, // header keeps the key out of URL logs
      },
      body: JSON.stringify(body),
    });

    const raw = await readTextCapped(res, 4_000_000, "Gemini");

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(raw) as { error?: { message?: string } };
        if (j?.error?.message) msg = j.error.message;
      } catch {
        /* non-JSON error body */
      }
      return { ok: false, error: `Gemini ${msg}` };
    }

    const json = JSON.parse(raw) as {
      candidates?: { content?: GeminiContent; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };

    const cand = json.candidates?.[0];
    const content = cand?.content ?? null;
    const parts: GeminiPart[] = content?.parts ?? [];

    const text = parts
      .filter((p): p is { text: string } => "text" in p)
      .map((p) => p.text)
      .join("")
      .trim();

    const functionCalls = parts
      .filter((p): p is { functionCall: GeminiFunctionCall } => "functionCall" in p)
      .map((p) => p.functionCall);

    if (!content && json.promptFeedback?.blockReason) {
      return { ok: false, error: `Gemini blocked the prompt (${json.promptFeedback.blockReason})` };
    }

    return { ok: true, content, text, functionCalls };
  } catch (e) {
    if (e instanceof FetchGuardError) {
      return { ok: false, error: e.timedOut ? "Gemini timed out" : e.message };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Gemini request failed" };
  }
}
