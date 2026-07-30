export type OracleLlmMode = "anthropic" | "ollama" | "gemini" | "groq" | "cerebras";

/**
 * Resolves which backend powers Oracle chat + insights.
 *
 * - `ORACLE_LLM=cerebras` → Cerebras (requires `CEREBRAS_API_KEY`; free tier: gpt-oss-120b,
 *   ~1M tokens/day, ~60k+ tokens/MINUTE — the best free option, no throttle wall).
 * - `ORACLE_LLM=groq` → Groq (`GROQ_API_KEY`; free but 8k TPM).
 * - `ORACLE_LLM=gemini` → Google Gemini (`GEMINI_API_KEY`; free tier).
 * - `ORACLE_LLM=anthropic` → Anthropic (`ANTHROPIC_API_KEY`; paid).
 * - `ORACLE_LLM=ollama` → local Ollama.
 * - Unset → Cerebras, then Groq, then Gemini, then Anthropic if keyed, else local Ollama.
 */
export function getOracleLlmMode(): OracleLlmMode {
  const v = (process.env.ORACLE_LLM ?? "").toLowerCase().trim();
  if (v === "ollama") return "ollama";
  if (v === "anthropic") return "anthropic";
  if (v === "gemini") return "gemini";
  if (v === "groq") return "groq";
  if (v === "cerebras") return "cerebras";
  if (process.env.CEREBRAS_API_KEY?.trim()) return "cerebras";
  if (process.env.GROQ_API_KEY?.trim()) return "groq";
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "anthropic";
  return "ollama";
}

/** Base URL for Cerebras's OpenAI-compatible API. */
export function getCerebrasBaseUrl(): string {
  return (process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai/v1").replace(/\/$/, "");
}

/**
 * Cerebras model id. Default `gpt-oss-120b` — smart, free, correct tool calls, and the free
 * tier's ~60k+ TPM easily fits our turns (no throttle). Alternatives: llama-3.3-70b, qwen-3-235b.
 */
export function getCerebrasModel(): string {
  return (process.env.CEREBRAS_MODEL ?? "gpt-oss-120b").trim() || "gpt-oss-120b";
}

/** Sampling temperature for Cerebras (default 0.4). */
export function getCerebrasTemperature(): number {
  const raw = process.env.CEREBRAS_TEMPERATURE?.trim();
  if (raw === undefined || raw === "") return 0.4;
  const n = Number(raw);
  if (Number.isNaN(n)) return 0.4;
  return Math.min(2, Math.max(0, n));
}

/** Base URL for Groq's OpenAI-compatible API. */
export function getGroqBaseUrl(): string {
  return (process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
}

/**
 * Groq model id. Default `openai/gpt-oss-20b` — free, fast, and emits CORRECT
 * structured tool calls within tight free-tier token limits. Use
 * `openai/gpt-oss-120b` for more reasoning power (slower / heavier on free TPM).
 * (Avoid llama-3.3-70b-versatile on Groq: it mis-formats tool calls as
 * `<function=...>` text and fails with tool_use_failed.) Override via GROQ_MODEL.
 */
export function getGroqModel(): string {
  return (process.env.GROQ_MODEL ?? "openai/gpt-oss-20b").trim() || "openai/gpt-oss-20b";
}

/** Sampling temperature for Groq (default 0.4). */
export function getGroqTemperature(): number {
  const raw = process.env.GROQ_TEMPERATURE?.trim();
  if (raw === undefined || raw === "") return 0.4;
  const n = Number(raw);
  if (Number.isNaN(n)) return 0.4;
  return Math.min(2, Math.max(0, n));
}

/** Base URL for the Google Generative Language API (override for proxies/tests). */
export function getGeminiBaseUrl(): string {
  return (process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com").replace(/\/$/, "");
}

/**
 * Gemini model id. Default `gemini-2.5-flash-lite` — on the FREE tier it has a
 * higher request-per-minute limit and far less "high demand" overload than plain
 * `gemini-2.5-flash` (verified 2026-06: flash repeatedly 503'd; flash-lite did not).
 * Set GEMINI_MODEL=gemini-2.5-flash for higher quality once on a paid tier.
 * (gemini-2.0-flash was deprecated 2026-06-01 — don't use it.)
 */
export function getGeminiModel(): string {
  return (process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite").trim() || "gemini-2.5-flash-lite";
}

/** Sampling temperature for Gemini (default 0.4 — factual but not robotic). */
export function getGeminiTemperature(): number {
  const raw = process.env.GEMINI_TEMPERATURE?.trim();
  if (raw === undefined || raw === "") return 0.4;
  const n = Number(raw);
  if (Number.isNaN(n)) return 0.4;
  return Math.min(1, Math.max(0, n));
}

/** Base URL for Ollama (server-side only). Default: local daemon. */
export function getOllamaBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
}

/** Model name as shown in `ollama list` (e.g. llama3.2, mistral). */
export function getOllamaModel(): string {
  return (process.env.OLLAMA_MODEL ?? "llama3.2").trim() || "llama3.2";
}

function readEnvNumber(key: string, fallback: number, min: number, max: number): number {
  const raw = process.env[key]?.trim();
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Tuned for tool use + factual campus answers (override via .env.local). */
export function getOllamaGenerationOptions(): Record<string, number> {
  return {
    temperature: readEnvNumber("OLLAMA_TEMPERATURE", 0.2, 0, 1.5),
    num_predict: Math.floor(readEnvNumber("OLLAMA_NUM_PREDICT", 2048, 256, 8192)),
    num_ctx: Math.floor(readEnvNumber("OLLAMA_NUM_CTX", 8192, 2048, 32768)),
    top_p: readEnvNumber("OLLAMA_TOP_P", 0.9, 0.1, 1),
    repeat_penalty: readEnvNumber("OLLAMA_REPEAT_PENALTY", 1.12, 1, 1.5),
  };
}

/** When true, schedule skips the LLM and pastes the planner markdown only (feels like a bot). Default off. */
export function useDirectScheduleRender(): boolean {
  const v = (process.env.OLLAMA_DIRECT_SCHEDULE ?? "0").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function getAnthropicTemperature(): number {
  const raw = process.env.ANTHROPIC_TEMPERATURE?.trim();
  if (raw === undefined || raw === "") return 0.45;
  const n = Number(raw);
  if (Number.isNaN(n)) return 0.45;
  return Math.min(1, Math.max(0, n));
}
