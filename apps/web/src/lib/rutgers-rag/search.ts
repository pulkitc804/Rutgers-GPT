import { loadRutgersCorpus } from "./load-corpus";
import { scoreTokens, tokenize } from "./tokenize";
import type { RagSearchHit } from "./types";

export async function searchRutgersKnowledge(params: {
  query: string;
  limit?: number;
  campus?: "NB";
}): Promise<RagSearchHit[]> {
  const qTokens = tokenize(params.query);
  if (!qTokens.length) return [];

  const corpus = await loadRutgersCorpus();
  const hits: RagSearchHit[] = [];

  for (const chunk of corpus) {
    if (params.campus && chunk.campus && chunk.campus !== "all" && chunk.campus !== params.campus) {
      continue;
    }
    const dTokens = tokenize(`${chunk.title} ${chunk.text} ${chunk.tags.join(" ")}`);
    let score = scoreTokens(qTokens, dTokens);
    if (params.campus && chunk.campus === params.campus) score += 0.15;
    if (score > 0.2) hits.push({ chunk, score });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, params.limit ?? 5);
}

export function formatRagHitsForAgent(hits: RagSearchHit[]): string {
  if (!hits.length) return "No matching Rutgers knowledge base entries.";
  return hits
    .map(
      (h, i) =>
        `[${i + 1}] ${h.chunk.title} (source: ${h.chunk.source}, score: ${h.score.toFixed(2)})\n${h.chunk.text.slice(0, 900)}`,
    )
    .join("\n\n---\n\n");
}
