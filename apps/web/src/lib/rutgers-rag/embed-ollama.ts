import { getOllamaBaseUrl } from "@/lib/oracle-llm-config";
import type { RagChunk } from "./types";

/** Optional semantic rerank via Ollama embeddings (nomic-embed-text, mxbai-embed-large, etc.). */
export async function rerankWithOllamaEmbeddings(
  query: string,
  hits: { chunk: RagChunk; score: number }[],
): Promise<{ chunk: RagChunk; score: number }[]> {
  const model = process.env.OLLAMA_EMBED_MODEL?.trim();
  if (!model || hits.length < 2) return hits;

  const base = getOllamaBaseUrl();
  const embed = async (text: string) => {
    const res = await fetch(`${base}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text.slice(0, 2000) }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { embedding?: number[] };
    return j.embedding ?? null;
  };

  const dot = (a: number[], b: number[]) => {
    let s = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) s += a[i] * b[i];
    return s;
  };

  const qVec = await embed(query);
  if (!qVec) return hits;

  const scored = await Promise.all(
    hits.map(async (h) => {
      const v = await embed(`${h.chunk.title}\n${h.chunk.text.slice(0, 500)}`);
      if (!v) return h;
      return { chunk: h.chunk, score: h.score * 0.4 + dot(qVec, v) * 0.6 };
    }),
  );
  scored.sort((a, b) => b.score - a.score);
  return scored;
}
