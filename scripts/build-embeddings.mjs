#!/usr/bin/env node
/**
 * Build a semantic embedding index for the Rutgers corpus.
 *
 * Re-chunks every corpus doc into ~700-char windows (with overlap), embeds each with
 * Gemini gemini-embedding-001 (768 dims, free tier), and writes a committed
 * apps/web/data/rutgers-corpus.vectors.json. Query-time we embed the question once and
 * cosine-rank against this file — real semantic retrieval, replacing the keyword-only
 * search (and the dead Ollama reranker that can't run on Vercel).
 *
 * Usage: GEMINI_API_KEY=... node scripts/build-embeddings.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.join(__dirname, "..", "apps", "web", "data", "rutgers-corpus");
const OUT = path.join(__dirname, "..", "apps", "web", "data", "rutgers-corpus.vectors.json");
const MODEL = "gemini-embedding-001";
const DIMS = 768;

const KEY = process.env.GEMINI_API_KEY?.trim();
if (!KEY) {
  console.error("Set GEMINI_API_KEY (the app's key works). Aborting.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Split one doc into ~700-char windows with ~120-char overlap, keeping title + source URL. */
function chunkDoc(file, raw) {
  const title = raw.match(/^##\s+(.+)/m)?.[1]?.trim() ?? path.basename(file, ".md");
  const source = raw.match(/^(?:Source:|Official Rutgers[^:]*:)\s*(https?:\/\/\S+)/m)?.[1] ?? "";
  const clean = raw
    .split("\n")
    .filter((l) => !/^Source:\s*https?:\/\//.test(l.trim()))
    .join("\n");
  const paras = clean.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 2);

  const chunks = [];
  let cur = "";
  for (const p of paras) {
    if (cur && (cur.length + p.length) > 700) {
      chunks.push(cur.trim());
      cur = cur.slice(-120) + "\n" + p; // carry overlap
    } else {
      cur = cur ? `${cur}\n${p}` : p;
    }
  }
  if (cur.trim().length > 20) chunks.push(cur.trim());

  return chunks.map((text, i) => ({ id: `${file}#${i}`, source: file, sourceUrl: source, title, text }));
}

async function embed(text, attempt = 0) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({
        model: `models/${MODEL}`,
        content: { parts: [{ text: text.slice(0, 8000) }] },
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: DIMS,
      }),
    });
    if (res.status === 429 && attempt < 6) {
      const wait = 3000 * (attempt + 1);
      process.stdout.write(`(429, wait ${wait / 1000}s) `);
      await sleep(wait);
      return embed(text, attempt + 1);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const j = await res.json();
    const v = j.embedding?.values;
    if (!Array.isArray(v)) throw new Error("no embedding values");
    return v;
  } catch (e) {
    if (attempt < 4) {
      await sleep(2000 * (attempt + 1));
      return embed(text, attempt + 1);
    }
    throw e;
  }
}

async function main() {
  const files = (await fs.readdir(CORPUS_DIR)).filter((f) => f.endsWith(".md"));
  const allChunks = [];
  for (const f of files) {
    const raw = await fs.readFile(path.join(CORPUS_DIR, f), "utf8");
    allChunks.push(...chunkDoc(f, raw));
  }
  console.log(`Chunked ${files.length} docs → ${allChunks.length} chunks. Embedding (${MODEL}, ${DIMS}d)…`);

  const out = [];
  let done = 0;
  for (const c of allChunks) {
    const embedding = await embed(`${c.title}\n${c.text}`);
    out.push({ ...c, embedding });
    done++;
    if (done % 20 === 0) process.stdout.write(`${done}/${allChunks.length} `);
    await sleep(120); // stay under free RPM
  }
  console.log(`\nEmbedded ${out.length} chunks.`);
  await fs.writeFile(OUT, JSON.stringify({ model: MODEL, dims: DIMS, builtAt: new Date().toISOString(), chunks: out }));
  const kb = Math.round((await fs.stat(OUT)).size / 1024);
  console.log(`Wrote ${OUT} (${kb} KB).`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
