export type RagChunk = {
  id: string;
  source: string;
  title: string;
  text: string;
  campus?: "NB" | "all";
  tags: string[];
};

export type RagSearchHit = {
  chunk: RagChunk;
  score: number;
};
