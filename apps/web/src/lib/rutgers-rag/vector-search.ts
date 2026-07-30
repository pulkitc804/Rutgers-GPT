import fs from "node:fs/promises";
import path from "node:path";
import { embedQuery } from "./embed-gemini";
import type { RagSearchHit } from "./types";

type VectorChunk = {
  id: string;
  source: string;
  sourceUrl?: string;
  title: string;
  text: string;
  embedding: number[];
};
type VectorIndex = { model: string; dims: number; chunks: VectorChunk[] };

let cache: VectorIndex | null | undefined; // undefined = not tried, null = unavailable

async function loadIndex(): Promise<VectorIndex | null> {
  if (cache !== undefined) return cache ?? null;
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "data", "rutgers-corpus.vectors.json"),
    path.join(cwd, "apps", "web", "data", "rutgers-corpus.vectors.json"),
  ];
  for (const c of candidates) {
    try {
      const raw = await fs.readFile(c, "utf8");
      cache = JSON.parse(raw) as VectorIndex;
      return cache;
    } catch {
      /* try next */
    }
  }
  cache = null;
  return null;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Semantic search over the committed embedding index. Returns [] if the index is missing or
 * the query couldn't be embedded — caller should fall back to keyword search.
 * Scores are cosine similarity (~0–1); a hit ≥ ~0.55 is a confident match.
 */
export async function vectorSearchKnowledge(query: string, limit = 5): Promise<RagSearchHit[]> {
  const index = await loadIndex();
  if (!index || !index.chunks.length) return [];
  const qv = await embedQuery(query);
  if (!qv) return [];

  const scored = index.chunks.map((c) => ({
    chunk: {
      id: c.id,
      source: c.sourceUrl || c.source,
      title: c.title,
      // surface the official URL inline so the model cites it
      text: c.sourceUrl ? `${c.text}\n\nSource: ${c.sourceUrl}` : c.text,
      campus: "NB" as const,
      tags: [],
    },
    score: cosine(qv, c.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** True if the embedding index exists (so the route can prefer semantic over keyword search). */
export async function hasVectorIndex(): Promise<boolean> {
  return (await loadIndex()) != null;
}
