/**
 * Live Rutgers web search + read — answers ANY Rutgers question without per-topic
 * curation.
 *
 * Strategy: DuckDuckGo (no API key) finds relevant rutgers.edu pages for the query,
 * we capture each result's search snippet (which survives JS-rendering) AND fetch the
 * top pages for fuller text. A small curated registry of high-value pages is merged in
 * as a high-trust booster. The agent answers ONLY from what this returns, and cites the
 * Source URLs.
 */
import { fetchWithGuard, readTextCapped } from "@rutgers-gpt/shared/net";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ---------- curated high-trust pages (booster) ----------
type OfficialPage = { keywords: string[]; title: string; url: string };
const OFFICIAL_PAGES: OfficialPage[] = [
  { title: "Rutgers Academic Calendar", url: "https://scheduling.rutgers.edu/academic-calendar/", keywords: ["academic calendar", "semester dates", "first day of classes", "last day of classes", "reading day", "finals", "exam schedule", "spring break", "add/drop", "withdrawal deadline", "when do classes start"] },
  { title: "Rutgers Summer Session", url: "https://summersession.rutgers.edu/", keywords: ["summer session", "session 1", "session 2", "summer class", "summer registration"] },
  { title: "Rutgers New Brunswick Bus Routes", url: "https://ipo.rutgers.edu/transportation/buses/nb", keywords: ["bus", "route", "shuttle", "passio", "college ave to busch", "campus bus"] },
];

// ---------- text extraction ----------
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&rsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

const STOP = new Set("the a an of for to in on at is are was be with from by as it that this you your what when how do does my i me".split(" "));
function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t));
}

function focusedExcerpt(text: string, query: string, max = 1100): string {
  if (text.length <= max) return text;
  const tokens = tokenize(query);
  const lower = text.toLowerCase();
  let idx = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i !== -1 && (idx === -1 || i < idx)) idx = i;
  }
  if (idx === -1) return text.slice(0, max) + " …";
  const start = Math.max(0, idx - 300);
  return (start > 0 ? "… " : "") + text.slice(start, start + max) + " …";
}

// ---------- DuckDuckGo search (no key) ----------
type SearchResult = { url: string; snippet: string };

function decodeUddg(href: string): string | null {
  const m = href.match(/uddg=([^&"]+)/);
  if (!m) return href.startsWith("http") ? href : null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

async function ddgSearch(query: string, limit = 6): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetchWithGuard(url, {
      label: "DDG",
      timeoutMs: 9000,
      retries: 1,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
    });
    if (!res.ok) return [];
    const html = await readTextCapped(res, 3_000_000, "DDG");
    const results: SearchResult[] = [];
    // Each result: <a class="result__a" href="...uddg=...">; snippet in result__snippet
    const blockRe = /result__a"[^>]*href="([^"]+)"[\s\S]*?(?:result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
    let m: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((m = blockRe.exec(html)) !== null && results.length < limit) {
      const link = decodeUddg(m[1]);
      if (!link) continue;
      let host: string;
      try {
        host = new URL(link).hostname;
      } catch {
        continue;
      }
      if (!host.endsWith("rutgers.edu")) continue; // official only
      if (seen.has(link)) continue;
      seen.add(link);
      const snippet = m[2] ? htmlToText(m[2]) : "";
      results.push({ url: link, snippet });
    }
    return results;
  } catch {
    return [];
  }
}

async function fetchPageText(url: string, query: string): Promise<string | null> {
  try {
    const res = await fetchWithGuard(url, {
      label: "RutgersPage",
      timeoutMs: 8000,
      retries: 1,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
    });
    if (!res.ok) return null;
    const text = htmlToText(await readTextCapped(res, 4_000_000, "RutgersPage"));
    if (text.length < 200) return null; // JS shell — rely on the search snippet instead
    return focusedExcerpt(text, query);
  } catch {
    return null;
  }
}

export type RutgersOfficialLookup = {
  query: string;
  results: { title: string; url: string; excerpt: string }[];
  note?: string;
};

/** Live search Rutgers for any query: DDG results (snippets + fetched pages) + curated boosters. */
export async function lookupRutgersOfficial(query: string): Promise<RutgersOfficialLookup> {
  // 1. curated booster (exact, high-trust) for known topics
  const qTokens = tokenize(query);
  const qLower = query.toLowerCase();
  const curated = OFFICIAL_PAGES
    .map((p) => {
      let s = 0;
      for (const kw of p.keywords) {
        if (qLower.includes(kw)) s += kw.includes(" ") ? 3 : 2;
        else if (qTokens.some((t) => kw.includes(t))) s += 1;
      }
      return { p, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 1)
    .map((x) => x.p);

  // 2. live search Rutgers (scope to official site, then a broader pass if thin)
  let search = await ddgSearch(`${query} site:rutgers.edu`, 6);
  if (search.length < 2) {
    const broad = await ddgSearch(`Rutgers New Brunswick ${query}`, 6);
    const seen = new Set(search.map((r) => r.url));
    for (const r of broad) if (!seen.has(r.url)) search.push(r);
  }

  // 3. assemble target URLs: curated first, then search hits (dedup), cap fetches
  const targets: { url: string; title: string; snippet: string }[] = [];
  const seen = new Set<string>();
  for (const c of curated) {
    targets.push({ url: c.url, title: c.title, snippet: "" });
    seen.add(c.url);
  }
  for (const r of search) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    targets.push({ url: r.url, title: r.url.replace(/^https?:\/\//, "").split("/")[0], snippet: r.snippet });
  }

  // 4. fetch the top few for fuller text; fall back to the search snippet
  const results: RutgersOfficialLookup["results"] = [];
  for (const t of targets.slice(0, 3)) {
    const text = await fetchPageText(t.url, query);
    const excerpt = text ?? (t.snippet ? `(search summary) ${t.snippet}` : "");
    if (excerpt.trim().length > 40) results.push({ title: t.title, url: t.url, excerpt });
  }

  if (!results.length) {
    return {
      query,
      results: [],
      note: "No official Rutgers page found for this. Tell the student you don't have a verified source and point them to https://www.rutgers.edu — do not guess.",
    };
  }

  return {
    query,
    results,
    note: "Answer ONLY from the excerpts above and cite the Source url(s). If the specific fact isn't present, say you couldn't confirm it and link the most relevant page — never invent dates, numbers, course codes, or routes.",
  };
}
