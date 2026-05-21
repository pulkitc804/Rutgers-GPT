const STOP = new Set(
  "a an the and or for to of in on at is are was be with from by as it that this your you".split(" "),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9:\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function scoreTokens(query: string[], doc: string[]): number {
  if (!query.length || !doc.length) return 0;
  const docSet = new Set(doc);
  let hits = 0;
  for (const q of query) {
    if (docSet.has(q)) hits += 1;
    else if (doc.some((d) => d.includes(q) || q.includes(d))) hits += 0.5;
  }
  return hits / Math.sqrt(query.length);
}
