/**
 * Live lookup of OFFICIAL Rutgers–New Brunswick pages.
 *
 * Free, no API key: a curated registry of high-value rutgers.edu pages
 * (academic calendar, registrar, financial aid, etc.). Picks the best match
 * for the query, fetches it server-side, extracts readable text, and returns a
 * focused excerpt the agent can answer from + cite. Lets the Oracle answer
 * "what are the Summer Session 2 dates?" instead of abstaining — without ever
 * inventing the answer (it only repeats text it actually fetched).
 */
import { fetchWithGuard, readTextCapped } from "@rutgers-gpt/shared/net";

type OfficialPage = { keywords: string[]; title: string; url: string };

/** High-value official NB pages. Add more as gaps surface (the abstention log is the roadmap). */
const OFFICIAL_PAGES: OfficialPage[] = [
  {
    title: "Rutgers Summer Session (dates, registration, deadlines)",
    url: "https://summersession.rutgers.edu/",
    keywords: [
      "summer session", "summer session 1", "summer session 2", "session 1", "session 2",
      "summer class", "summer course", "summer registration", "summer deadline", "summer dates", "summer 2026",
    ],
  },
  {
    title: "Rutgers Academic Calendar",
    url: "https://scheduling.rutgers.edu/academic-calendar/",
    keywords: [
      "academic calendar", "calendar", "summer session", "session 2", "session 1",
      "winter session", "semester dates", "first day of classes", "last day of classes",
      "reading day", "finals", "final exam", "exam schedule", "spring break", "recess",
      "add/drop", "add drop", "withdrawal deadline", "holiday", "when do classes start",
    ],
  },
  { title: "Office of the Registrar", url: "https://registrar.rutgers.edu/", keywords: ["registrar", "registration", "transcript", "enrollment verification", "webreg", "course schedule planner"] },
  { title: "Financial Aid (New Brunswick)", url: "https://financialaid.rutgers.edu/", keywords: ["financial aid", "fafsa", "scholarship", "grant", "loan", "work study", "aid disbursement"] },
  { title: "Student Accounting / Tuition & Fees", url: "https://studentabc.rutgers.edu/tuition-and-fees", keywords: ["tuition", "fees", "term bill", "bill", "cost of attendance", "payment", "due date", "how much"] },
  { title: "Parking (DOTS)", url: "https://ipo.rutgers.edu/dots", keywords: ["parking", "permit", "commuter", "parking deck", "lot", "ticket", "tow"] },
  { title: "Rutgers University Libraries", url: "https://www.libraries.rutgers.edu/", keywords: ["library", "libraries", "study room", "alexander library", "lsm", "kilmer", "book a room"] },
  { title: "Rutgers IT / NetID Help", url: "https://it.rutgers.edu/help-support/", keywords: ["netid", "password", "wifi", "eduroam", "email", "it help", "oit", "vpn", "duo", "multi-factor"] },
  { title: "SAS Undergraduate Advising", url: "https://sasundergrad.rutgers.edu/advising", keywords: ["advising", "advisor", "declare major", "change major", "sas", "degree requirements"] },
  { title: "Student Health Services", url: "https://health.rutgers.edu/", keywords: ["health", "caps", "counseling", "student health", "insurance", "immunization", "pharmacy", "appointment"] },
  { title: "Residence Life / Housing", url: "https://reslife.rutgers.edu/", keywords: ["housing", "residence", "dorm", "on-campus housing", "res life", "roommate", "move in"] },
  { title: "Rutgers Dining Services", url: "https://food.rutgers.edu/", keywords: ["dining", "meal plan", "dining hall", "meal swipes", "knight express"] },
  { title: "Commencement / Graduation", url: "https://commencement.rutgers.edu/", keywords: ["graduation", "commencement", "apply to graduate", "diploma", "cap and gown"] },
];

const STOP = new Set(["the", "a", "an", "of", "for", "to", "in", "on", "at", "is", "are", "what", "when", "how", "do", "does", "my", "i", "me"]);

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t));
}

function scorePage(query: string, page: OfficialPage): number {
  const q = query.toLowerCase();
  const qTokens = tokenize(query);
  let score = 0;
  for (const kw of page.keywords) {
    if (q.includes(kw)) score += kw.includes(" ") ? 3 : 2; // phrase match worth more
    else if (qTokens.some((t) => kw.includes(t))) score += 1;
  }
  return score;
}

/** Strip HTML to readable text. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/** Return a window of text around the first query-keyword hit (so dates/deadlines surface). */
function focusedExcerpt(text: string, query: string, max = 2800): string {
  if (text.length <= max) return text;
  const tokens = tokenize(query);
  const lower = text.toLowerCase();
  let idx = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i !== -1 && (idx === -1 || i < idx)) idx = i;
  }
  if (idx === -1) return text.slice(0, max) + " …";
  const start = Math.max(0, idx - 400);
  return (start > 0 ? "… " : "") + text.slice(start, start + max) + " …";
}

export type RutgersOfficialLookup = {
  query: string;
  results: { title: string; url: string; excerpt: string }[];
  note?: string;
};

export async function lookupRutgersOfficial(query: string): Promise<RutgersOfficialLookup> {
  const ranked = OFFICIAL_PAGES.map((p) => ({ p, s: scorePage(query, p) }))
    .sort((a, b) => b.s - a.s);

  const top = ranked.filter((r) => r.s > 0).slice(0, 2);
  // No keyword hit → still try the two most generally useful pages.
  const pages = (top.length ? top : ranked.slice(0, 0)).map((r) => r.p);

  if (!pages.length) {
    return {
      query,
      results: [],
      note: "No official Rutgers page is mapped for this yet. Tell the student you don't have a verified source and point them to https://www.rutgers.edu — do not guess.",
    };
  }

  const results: RutgersOfficialLookup["results"] = [];
  for (const page of pages) {
    try {
      const res = await fetchWithGuard(page.url, {
        label: "RutgersOfficial",
        timeoutMs: 8000,
        retries: 1,
        headers: { "User-Agent": "RutgersGPT/1.0 (+https://rutgers.edu)", Accept: "text/html" },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const html = await readTextCapped(res, 5_000_000, "RutgersOfficial");
      const text = htmlToText(html);
      if (text.length < 50) continue;
      results.push({ title: page.title, url: page.url, excerpt: focusedExcerpt(text, query) });
    } catch {
      // skip a page that fails; the agent will work with whatever fetched
    }
  }

  if (!results.length) {
    return {
      query,
      results: [],
      note: "Could not reach the official Rutgers page(s) right now. Tell the student to check the official site and offer to retry — do not guess.",
    };
  }

  return {
    query,
    results,
    note: "Answer ONLY from the excerpts above and cite the url. If the specific fact isn't in the text, say you couldn't find it on the official page — never invent dates or numbers.",
  };
}
