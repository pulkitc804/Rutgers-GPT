import fs from "node:fs/promises";
import path from "node:path";
import type { RagChunk } from "./types";

async function resolveCorpusDir(): Promise<string> {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "data", "rutgers-corpus"),
    path.join(cwd, "apps", "web", "data", "rutgers-corpus"),
  ];
  for (const c of candidates) {
    try {
      await fs.access(c);
      return c;
    } catch {
      /* try next */
    }
  }
  return candidates[1];
}

function inferCampus(filename: string, text: string): RagChunk["campus"] {
  if (/newark|camden/i.test(filename)) return "all";
  return "NB";
}

function splitMarkdown(file: string, raw: string): RagChunk[] {
  const campus = inferCampus(file, raw);
  const parts = raw.split(/\n(?=## )/);
  const chunks: RagChunk[] = [];
  let i = 0;
  for (const part of parts) {
    const titleMatch = part.match(/^##\s+(.+)/m);
    const title = titleMatch?.[1]?.trim() ?? path.basename(file, ".md");
    const text = part.trim();
    if (text.length < 40) continue;
    chunks.push({
      id: `${file}#${i++}`,
      source: file,
      title,
      text,
      campus,
      tags: tokenizeTags(text),
    });
  }
  if (!chunks.length && raw.trim().length > 40) {
    chunks.push({
      id: `${file}#0`,
      source: file,
      title: path.basename(file, ".md"),
      text: raw.trim(),
      campus,
      tags: tokenizeTags(raw),
    });
  }
  return chunks;
}

function tokenizeTags(text: string): string[] {
  const tags: string[] = [];
  if (/canvas/i.test(text)) tags.push("canvas");
  if (/soc|schedule of classes/i.test(text)) tags.push("soc");
  if (/bus|passio|transit/i.test(text)) tags.push("transit");
  if (/dining|food/i.test(text)) tags.push("dining");
  if (/cs|computer science|198:111/i.test(text)) tags.push("cs");
  if (/library|building|hours/i.test(text)) tags.push("buildings");
  if (/wellness|caps/i.test(text)) tags.push("wellness");
  return tags;
}

let cached: RagChunk[] | null = null;

export async function loadRutgersCorpus(): Promise<RagChunk[]> {
  if (cached) return cached;
  const dir = await resolveCorpusDir();
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch {
    cached = [];
    return cached;
  }
  const all: RagChunk[] = [];
  for (const f of files) {
    const raw = await fs.readFile(path.join(dir, f), "utf8");
    all.push(...splitMarkdown(f, raw));
  }
  cached = all;
  return all;
}
