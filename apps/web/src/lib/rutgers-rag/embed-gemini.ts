import { fetchWithGuard, readTextCapped } from "@rutgers-gpt/shared/net";

/** Embedding model used for both the build-time index and query-time search. Must match. */
export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIMS = 768;

/**
 * Embed a search query with Gemini (free embedding quota, separate from chat). Returns null
 * if no key or the call fails — callers fall back to keyword search so retrieval never hard-fails.
 */
export async function embedQuery(text: string): Promise<number[] | null> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  try {
    const res = await fetchWithGuard(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`,
      {
        label: "GeminiEmbed",
        timeoutMs: 8000,
        retries: 1,
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text: text.slice(0, 4000) }] },
          taskType: "RETRIEVAL_QUERY",
          outputDimensionality: EMBED_DIMS,
        }),
      },
    );
    if (!res.ok) return null;
    const j = JSON.parse(await readTextCapped(res, 1_000_000, "GeminiEmbed")) as {
      embedding?: { values?: number[] };
    };
    const v = j.embedding?.values;
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
