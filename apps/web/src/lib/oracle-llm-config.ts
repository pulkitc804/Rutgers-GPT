export type OracleLlmMode = "anthropic" | "ollama";

/**
 * Resolves which backend powers Oracle chat + insights.
 *
 * - `ORACLE_LLM=ollama` → always Ollama (`OLLAMA_BASE_URL`, default http://127.0.0.1:11434).
 * - `ORACLE_LLM=anthropic` → always Anthropic (requires `ANTHROPIC_API_KEY`).
 * - Unset → Anthropic if `ANTHROPIC_API_KEY` is set, otherwise **local Ollama** (easy local testing).
 */
export function getOracleLlmMode(): OracleLlmMode {
  const v = (process.env.ORACLE_LLM ?? "").toLowerCase().trim();
  if (v === "ollama") return "ollama";
  if (v === "anthropic") return "anthropic";
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "anthropic";
  return "ollama";
}

/** Base URL for Ollama (server-side only). Default: local daemon. */
export function getOllamaBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
}

/** Model name as shown in `ollama list` (e.g. llama3.2, mistral). */
export function getOllamaModel(): string {
  return (process.env.OLLAMA_MODEL ?? "llama3.2").trim() || "llama3.2";
}

/** Lower = more focused/deterministic (good for campus facts). Override with `OLLAMA_TEMPERATURE`. */
export function getOllamaGenerationOptions(): Record<string, number> {
  const out: Record<string, number> = {};
  const tRaw = process.env.OLLAMA_TEMPERATURE?.trim();
  if (tRaw !== undefined && tRaw !== "") {
    const n = Number(tRaw);
    if (!Number.isNaN(n)) out.temperature = Math.min(2, Math.max(0, n));
  } else {
    out.temperature = 0.35;
  }
  const npRaw = process.env.OLLAMA_NUM_PREDICT?.trim();
  if (npRaw !== undefined && npRaw !== "") {
    const n = Math.floor(Number(npRaw));
    if (!Number.isNaN(n) && n > 0) out.num_predict = n;
  } else {
    out.num_predict = 2048;
  }
  return out;
}

export function getAnthropicTemperature(): number {
  const raw = process.env.ANTHROPIC_TEMPERATURE?.trim();
  if (raw === undefined || raw === "") return 0.45;
  const n = Number(raw);
  if (Number.isNaN(n)) return 0.45;
  return Math.min(1, Math.max(0, n));
}
