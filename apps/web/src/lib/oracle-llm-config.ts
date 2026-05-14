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
