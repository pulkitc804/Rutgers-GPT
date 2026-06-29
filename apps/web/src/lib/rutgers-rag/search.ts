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
    // Strong title-match boost so a topical doc ("Mathematics Major Requirements")
    // wins over an incidental mention in a long unrelated page. Substring-aware so
    // "math" matches "mathematics".
    const titleToks = tokenize(chunk.title);
    let titleHits = 0;
    for (const q of qTokens) {
      if (titleToks.includes(q)) titleHits += 1;
      else if (titleToks.some((d) => d.includes(q) || q.includes(d))) titleHits += 0.6;
    }
    score += titleHits * 0.7;
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
        `[${i + 1}] ${h.chunk.title} (source: ${h.chunk.source}, score: ${h.score.toFixed(2)})\n${h.chunk.text.slice(0, 1400)}`,
    )
    .join("\n\n---\n\n");
}
